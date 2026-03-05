@echo off
echo Converting SVG fills/strokes to currentColor...

for %%f in (*.svg) do (
powershell -NoProfile -Command "(Get-Content '%%f') -replace 'fill=\"#[0-9a-fA-F]{3,6}\"','fill=\"currentColor\"' -replace 'fill=\"black\"','fill=\"currentColor\"' -replace 'stroke=\"#[0-9a-fA-F]{3,6}\"','stroke=\"currentColor\"' -replace 'stroke=\"black\"','stroke=\"currentColor\"' | Set-Content '%%f'"
echo Processed %%f
)

echo Done!
pause