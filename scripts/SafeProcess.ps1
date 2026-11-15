function Test-HomeGuardProcess($Process, [string]$Root, [string]$Entry, [string]$Executable) {
    if (-not $Process) { return $false }
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $resolvedEntry = [IO.Path]::GetFullPath($Entry)
    if (-not $resolvedEntry.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    $pattern='(?:^|[\s"])'+[Regex]::Escape($resolvedEntry)+'(?:$|[\s"])'
    return $Process.ExecutablePath -eq $Executable -and $Process.CommandLine -match $pattern
}
