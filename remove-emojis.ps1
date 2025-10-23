# Remove all emojis from source code
$rootPath = "c:\Users\Zak\Downloads\Highlights\bloomberg-terminal\src"
$files = Get-ChildItem -Path $rootPath -Recurse -Include *.ts,*.tsx,*.js,*.jsx

$totalFiles = 0

Write-Host "Removing emojis from code..." -ForegroundColor Cyan

# Common emoji unicode ranges
$emojiPattern = '[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2B50}]|[\u{2705}]|[\u{274C}]|[\u{274E}]|[\u{231A}]|[\u{231B}]|[\u{23F0}]|[\u{23F3}]|[\u{25AA}]|[\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{2B06}]|[\u{2B07}]|[\u{2934}]|[\u{2935}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE0F}]'

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    
    $original = $content
    
    # Remove emojis using regex
    $content = $content -replace $emojiPattern, ''
    
    # Also remove common specific emojis by their actual characters
    $content = $content -replace '[🚀⚡🔥💪🎯✅❌📊⏱️🏁🎉💥⚙️🌟📈📉💰🔴🟢⚠️✨🎨🔄🔍📝💡🏆🎪🌈⭐🔔📢🎬🎮🏃💻🖥️📱☁️🌐🗂️📂📁🔗🔒🔓⌚⏰📅📆🎂🎁🎄🎃🎈🎊🎇🎆]', ''
    
    # Clean up any double spaces left by emoji removal
    $content = $content -replace '  +', ' '
    # Clean up spaces at start of lines
    $content = $content -replace '^ +$', '', 'Multiline'
    
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $totalFiles++
        Write-Host "Cleaned: $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`nDone! Removed emojis from $totalFiles files" -ForegroundColor Yellow
