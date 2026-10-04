import os
from PIL import Image

src_path = r"C:\Users\sharm\.gemini\antigravity\brain\7a6d9932-cc6f-42d6-b607-4c0e46752aee\offline_player_logo_1790976029108.jpg"
if not os.path.exists(src_path):
    print("Source image not found.")
    exit(1)

src = Image.open(src_path)
src = src.convert("RGBA")

icon_dir = r"e:\Codes\Apps Build Files\Spotify Offline\src-tauri\icons"
os.makedirs(icon_dir, exist_ok=True)

sizes = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

for name, size in sizes.items():
    resized = src.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(icon_dir, name))

# Generate .ico with multiple sizes
ico_sizes = [16, 32, 48, 256]
ico_images = [src.resize((s, s), Image.LANCZOS) for s in ico_sizes]
ico_images[0].save(os.path.join(icon_dir, "icon.ico"), format="ICO", sizes=[(s, s) for s in ico_sizes])

# Save to public directory
public_dir = r"e:\Codes\Apps Build Files\Spotify Offline\public"
os.makedirs(public_dir, exist_ok=True)
resized_32 = src.resize((32, 32), Image.LANCZOS)
resized_32.save(os.path.join(public_dir, "app-icon.png"))
print("Done.")
