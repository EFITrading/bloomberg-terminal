$root = "c:\Users\zakho\Documents\bloomberg-terminal\src"
$extensions = @("*.tsx", "*.ts", "*.css")

# Map of mojibake -> correct Unicode
# These are UTF-8 bytes misread as Windows-1252 then re-encoded as UTF-8
$map = [System.Collections.Generic.Dictionary[string,string]]::new()
$map["â\u0080\u0094"] = "\u2014"   # EM DASH
$map["â\u0080\u0093"] = "\u2013"   # EN DASH
$map["â\u0094\u0080"] = "\u2500"   # BOX LIGHT HORIZ
$map["â\u0094\u0082"] = "\u2502"   # BOX LIGHT VERT
$map["â\u0094\u0094"] = "\u2514"   # BOX LIGHT UP-RIGHT
$map["â\u0094\u008c"] = "\u250c"   # BOX LIGHT DOWN-RIGHT
$map["â\u0088\u009e"] = "\u221e"   # INFINITY
$map["â\u009a\u00a0"] = "\u26a0"   # WARNING SIGN
$map["\u00ef\u00b8\u008f"] = "\ufe0f" # VARIATION SELECTOR-16
$map["â\u0080\u0099"] = "\u2019"   # RIGHT SINGLE QUOT
$map["â\u0080\u009c"] = "\u201c"   # LEFT DOUBLE QUOT
$map["â\u0080\u009d"] = "\u201d"   # RIGHT DOUBLE QUOT
$map["\u00c3\u00b7"] = "\u00f7"    # DIVISION SIGN - wait wrong
$map["\u00c3\u0097"] = "\u00d7"    # MULTIPLICATION SIGN
$map["\u00c2\u00b0"] = "\u00b0"    # DEGREE SIGN
$map["\u00c2\u00b7"] = "\u00b7"    # MIDDLE DOT

$files = Get-ChildItem -Path $root -Recurse -Include $extensions
$count = 0
foreach ($file in $files) {
    $original = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    $content = $original
    foreach ($kv in $map.GetEnumerator()) {
        $content = $content.Replace($kv.Key, $kv.Value)
    }
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "Fixed: $($file.Name)"
        $count++
    }
}
Write-Host "Done. Fixed $count files."
