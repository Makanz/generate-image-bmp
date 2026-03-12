# GenerateImageBmp

Console app that generates a 1-bit (monochrome) BMP image (default 800x480) with black text on a white background.

## Build

```bash
dotnet build
```

## Run

```bash
dotnet run --project src/GenerateImageBmp -- --text "BNP" --out bnp.bmp
```

Optional parameters:

- `--width 800` `--height 480`
- `--font "Segoe UI"` `--fontSize 64`
- `--margin 24`
- `--threshold 200`
- `--dither`

## Test

```bash
dotnet test
```
