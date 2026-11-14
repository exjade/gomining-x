export type RecolorTransform = {
  hueShift: number
  saturation: number
  lightness: number
  tint: string
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}

function rgbToHsl(redByte: number, greenByte: number, blueByte: number) {
  const red = redByte / 255
  const green = greenByte / 255
  const blue = blueByte / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  const lightness = (maximum + minimum) / 2
  if (delta === 0) return { hue: 0, saturation: 0, lightness }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue = maximum === red
    ? ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
    : maximum === green
      ? ((blue - red) / delta + 2) / 6
      : ((red - green) / delta + 4) / 6
  return { hue, saturation, lightness }
}

function hexToHsl(hex: string) {
  const value = hex.startsWith('#') ? hex.slice(1) : hex
  const normalized = value.length === 3 ? [...value].map((digit) => digit + digit).join('') : value
  return rgbToHsl(
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  )
}

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = hue * 6
  const secondary = chroma * (1 - Math.abs(section % 2 - 1))
  const [red, green, blue] = section < 1 ? [chroma, secondary, 0]
    : section < 2 ? [secondary, chroma, 0]
      : section < 3 ? [0, chroma, secondary]
        : section < 4 ? [0, secondary, chroma]
          : section < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary]
  const offset = lightness - chroma / 2
  return [(red + offset) * 255, (green + offset) * 255, (blue + offset) * 255]
}

/**
 * Recolors only mask-covered pixels. Hue comes from tint + hueShift; tint saturation is
 * multiplied by saturation; source shading is kept and shifted by tint lightness + lightness.
 * maskAlpha is the alpha byte from a same-size RGBA mask and becomes the output alpha.
 */
export function recolorPixelBuffer(pixels: Uint8ClampedArray, maskAlpha: Uint8ClampedArray, transform: RecolorTransform) {
  const tint = hexToHsl(transform.tint)
  const hue = ((tint.hue + transform.hueShift / 360) % 1 + 1) % 1
  const saturation = clamp(tint.saturation * transform.saturation)
  const tintLightnessOffset = tint.lightness - 0.5 + transform.lightness

  for (let offset = 0, pixel = 0; offset < pixels.length; offset += 4, pixel += 1) {
    const mask = maskAlpha[pixel] / 255
    if (mask === 0 || pixels[offset + 3] === 0) continue
    const source = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2])
    const recolored = hslToRgb(hue, saturation, clamp(source.lightness + tintLightnessOffset))
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[offset + channel] = pixels[offset + channel] * (1 - mask) + recolored[channel] * mask
    }
  }
}

export function composeRecolorPixels(
  sourcePixels: Uint8ClampedArray,
  layers: readonly { maskAlpha: Uint8ClampedArray; transform: RecolorTransform }[],
) {
  const composed = sourcePixels.slice()
  for (const layer of layers) recolorPixelBuffer(composed, layer.maskAlpha, layer.transform)
  return composed
}
