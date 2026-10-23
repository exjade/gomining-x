Add-Type -AssemblyName System.Drawing

function Draw-MinerX-Logo($size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Background rounded rect / circle
    $margin = [float]($size * 0.04)
    $rectSize = [float]($size - ($margin * 2))
    
    # Dark modern canvas
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 14, 23))
    $rect = New-Object System.Drawing.RectangleF($margin, $margin, $rectSize, $rectSize)
    $g.FillEllipse($bgBrush, $rect)

    # Emerald Outer Ring
    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 5, 223, 114), [float]($size * 0.04))
    $g.DrawEllipse($ringPen, $rect)

    # Sleek Cyber Lightning Bolt / Power Monogram
    # Coordinates normalized from 0.0 to 1.0
    $pointsNorm = @(
        [System.Drawing.PointF]::new(0.54 * $size, 0.16 * $size),
        [System.Drawing.PointF]::new(0.30 * $size, 0.52 * $size),
        [System.Drawing.PointF]::new(0.48 * $size, 0.52 * $size),
        [System.Drawing.PointF]::new(0.42 * $size, 0.84 * $size),
        [System.Drawing.PointF]::new(0.70 * $size, 0.44 * $size),
        [System.Drawing.PointF]::new(0.52 * $size, 0.44 * $size)
    )

    # Emerald Green gradient for the bolt
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        [System.Drawing.PointF]::new(0.3 * $size, 0.2 * $size),
        [System.Drawing.PointF]::new(0.7 * $size, 0.8 * $size),
        [System.Drawing.Color]::FromArgb(255, 5, 242, 146),
        [System.Drawing.Color]::FromArgb(255, 0, 229, 255)
    )

    $g.FillPolygon($gradBrush, $pointsNorm)

    # Subtle cyan accent highlight
    $highlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 255, 255, 255), [float]($size * 0.015))
    $g.DrawPolygon($highlightPen, $pointsNorm)

    $g.Dispose()
    return $bmp
}

# Ensure build directory exists
$buildDir = "C:\Users\Roman\Documents\MinerX\build"
if (!(Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir -Force | Out-Null }

# Generate 512x512 Master PNG
$logo512 = Draw-MinerX-Logo 512
$logo512.Save("$buildDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved $buildDir\icon.png"

# Generate Windows Multi-resolution ICO (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$bitmaps = @()
foreach ($s in $sizes) {
    $bitmaps += Draw-MinerX-Logo $s
}

# Save primary ICO using 256px
$icon = [System.Drawing.Icon]::FromHandle($bitmaps[0].GetHicon())
$fs = [System.IO.File]::OpenWrite("$buildDir\icon.ico")
$icon.Save($fs)
$fs.Close()
Write-Output "Saved $buildDir\icon.ico"

# Generate Android Mipmap icons
$androidRes = "C:\Users\Roman\Documents\MinerX\android\app\src\main\res"
$mipmapSizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

foreach ($entry in $mipmapSizes.GetEnumerator()) {
    $folder = Join-Path $androidRes $entry.Key
    if (Test-Path $folder) {
        $bmp = Draw-MinerX-Logo $entry.Value
        $bmp.Save((Join-Path $folder "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Save((Join-Path $folder "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Save((Join-Path $folder "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Output "Updated icons in $entry.Key"
    }
}

# Clean up
$logo512.Dispose()
foreach ($b in $bitmaps) { $b.Dispose() }
Write-Output "Icon generation completed successfully!"
