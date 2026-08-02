[CmdletBinding()]
param(
    [string]$Prefix,
    [string]$Profile,
    [string]$Bucket,
    [string]$Region,
    [string]$DistributionId
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectRoot "deployment.json"
$sitePath = Join-Path $projectRoot "site"

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Missing deployment.json."
}

if (-not (Test-Path -LiteralPath $sitePath -PathType Container)) {
    throw "Missing site directory."
}

$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
if (-not $Prefix) { $Prefix = [string]$config.prefix }
if (-not $Profile) { $Profile = [string]$config.profile }
if (-not $Bucket) { $Bucket = [string]$config.bucket }
if (-not $Region) { $Region = [string]$config.region }
if (-not $DistributionId) { $DistributionId = [string]$config.distributionId }

if ($Prefix -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
    throw "Prefix must be a canonical UUID."
}

$awsArgs = @("--profile", $Profile, "--region", $Region)
& aws sts get-caller-identity @awsArgs | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "AWS authentication failed. Run: aws login --profile $Profile"
}

$tempRoot = [System.IO.Path]::GetTempPath()
$deployPath = Join-Path $tempRoot ("red-word-blue-word-deploy-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $deployPath | Out-Null

try {
    Copy-Item -Path (Join-Path $sitePath "*") -Destination $deployPath -Recurse

    $indexPath = Join-Path $deployPath "index.html"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $assetVersion = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    $index = [System.IO.File]::ReadAllText($indexPath, $utf8NoBom)
    $baseTag = '<base href="/' + $Prefix + '/">'
    $index = $index.Replace("<!-- DEPLOY_BASE -->", $baseTag)
    $index = $index.Replace('href="#', ('href="/' + $Prefix + '#'))
    $index = $index.Replace('href="styles.css"', ('href="styles.css?v=' + $assetVersion + '"'))
    $index = $index.Replace('src="app.js"', ('src="app.js?v=' + $assetVersion + '"'))
    [System.IO.File]::WriteAllText($indexPath, $index, $utf8NoBom)

    $appPath = Join-Path $deployPath "app.js"
    $app = [System.IO.File]::ReadAllText($appPath, $utf8NoBom)
    $app = $app.Replace('from "./model.js"', ('from "./model.js?v=' + $assetVersion + '"'))
    $app = $app.Replace('from "./screens/generator-screen.js"', ('from "./screens/generator-screen.js?v=' + $assetVersion + '"'))
    $app = $app.Replace('from "./screens/router.js"', ('from "./screens/router.js?v=' + $assetVersion + '"'))
    [System.IO.File]::WriteAllText($appPath, $app, $utf8NoBom)

    $generatorPath = Join-Path $deployPath "screens\generator-screen.js"
    $generator = [System.IO.File]::ReadAllText($generatorPath, $utf8NoBom)
    $generator = $generator.Replace('from "../model.js"', ('from "../model.js?v=' + $assetVersion + '"'))
    [System.IO.File]::WriteAllText($generatorPath, $generator, $utf8NoBom)

    Write-Host "Uploading static assets to s3://$Bucket/$Prefix/"
    & aws s3 sync $deployPath "s3://$Bucket/$Prefix/" `
        --cache-control "public, max-age=300" `
        @awsArgs
    if ($LASTEXITCODE -ne 0) { throw "S3 asset upload failed." }

    Write-Host "Publishing the clean URL object s3://$Bucket/$Prefix"
    & aws s3 cp $indexPath "s3://$Bucket/$Prefix" `
        --content-type "text/html; charset=utf-8" `
        --cache-control "no-cache" `
        @awsArgs
    if ($LASTEXITCODE -ne 0) { throw "S3 clean URL upload failed." }

    & aws s3 cp $indexPath "s3://$Bucket/$Prefix/index.html" `
        --content-type "text/html; charset=utf-8" `
        --cache-control "no-cache" `
        @awsArgs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "S3 index upload failed." }

    Write-Host "Invalidating the app paths in CloudFront"
    & aws cloudfront create-invalidation `
        --distribution-id $DistributionId `
        --paths "/$Prefix" "/$Prefix/*" `
        --profile $Profile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "CloudFront invalidation failed." }

    Write-Host "Published: https://xoom.org/$Prefix"
}
finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
    $resolvedDeploy = [System.IO.Path]::GetFullPath($deployPath)
    if ($resolvedDeploy.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedDeploy).StartsWith("red-word-blue-word-deploy-")) {
        Remove-Item -LiteralPath $resolvedDeploy -Recurse -Force -ErrorAction SilentlyContinue
    }
}
