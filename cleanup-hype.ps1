# Clean up annoying AI-generated hype text
$rootPath = "c:\Users\Zak\Downloads\Highlights\bloomberg-terminal\src"
$files = Get-ChildItem -Path $rootPath -Recurse -Include *.ts,*.tsx,*.js,*.jsx

$totalFiles = 0

Write-Host "Cleaning up AI hype text..." -ForegroundColor Cyan

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    
    $original = $content
    
    # Remove console.logs with ULTRA/MAXIMUM/etc
    $content = $content -replace '  console\.log\(`[^`]*(ULTRA|MAXIMUM|SUPER|MEGA)[^`]*`\);?\r?\n', ''
    $content = $content -replace '  console\.log\([^)]*DEBUG[^)]*\);?\r?\n', ''
    $content = $content -replace '  console\.error\([^)]*DEBUG[^)]*\);?\r?\n', ''
    $content = $content -replace '  console\.warn\([^)]*DEBUG[^)]*\);?\r?\n', ''
    
    # Remove hype comments
    $content = $content -replace '// (ULTRA|MAXIMUM|SUPER|MEGA|HYPER|EXTREME)[-\s]*(FAST|SPEED|PERFORMANCE)[^\r\n]*\r?\n', ''
    $content = $content -replace '// .*ULTRA-FAST.*\r?\n', ''
    $content = $content -replace '// .*MAXIMUM SPEED.*\r?\n', ''
    
    # Clean up excessive whitespace
    $content = $content -replace '\r?\n\s*\r?\n\s*\r?\n', "`n`n"
    
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $totalFiles++
        Write-Host "Cleaned: $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`nDone! Modified $totalFiles files" -ForegroundColor Yellow
