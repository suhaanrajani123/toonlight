# slim-vrm.py — make a .vrm / .glb model smaller so the site loads faster.
#
# Most of a VRoid model's size is its textures. To keep the character sharp:
#   - face, eye and brow textures stay lossless PNG at full size (thin anime lines blur as JPEG)
#   - clothes, hair and skin stay full size, saved as high-quality JPEG when they have no transparency
#   - normal maps (fine lighting detail, hard to see) shrink to NORMAL_MAX pixels
#   - the preview picture stored inside the file (never shown on the site) shrinks to 256 pixels
# Everything else in the file (the mesh, bones, face expressions, VRM settings) is copied unchanged.
#
#   pip install pillow
#   python tools/slim-vrm.py input.vrm docs/models/kaito.vrm

import io, json, struct, sys
from PIL import Image

def pad4(b, fill=b'\0'):
    return b + fill * (-len(b) % 4)

NORMAL_MAX = 1024
FACE = ('face', 'eye', 'brow', 'lash', 'mouth', 'teeth')

def slim(src, dst, max_size=2048):
    data = open(src, 'rb').read()
    magic, version, _ = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF' and version == 2, 'not a .vrm / .glb file'
    jlen, jtype = struct.unpack('<II', data[12:20])
    gltf = json.loads(data[20:20 + jlen])
    blen, btype = struct.unpack('<II', data[20 + jlen:28 + jlen])
    binary = data[28 + jlen:28 + jlen + blen]

    # images used as normal maps (glTF materials, and VRM 0.x MToon materials)
    tex_to_img = [t.get('source') for t in gltf.get('textures', [])]
    normal = set()
    for m in gltf.get('materials', []):
        if 'normalTexture' in m:
            normal.add(tex_to_img[m['normalTexture']['index']])
    for m in gltf.get('extensions', {}).get('VRM', {}).get('materialProperties', []):
        if '_BumpMap' in m.get('textureProperties', {}):
            normal.add(tex_to_img[m['textureProperties']['_BumpMap']])

    # the preview picture (VRM 0.x: meta.texture -> texture; VRM 1.0: meta.thumbnailImage -> image)
    ext = gltf.get('extensions', {})
    thumb = None
    if 'texture' in ext.get('VRM', {}).get('meta', {}):
        t = ext['VRM']['meta']['texture']
        thumb = tex_to_img[t] if 0 <= t < len(tex_to_img) else None
    thumb = ext.get('VRMC_vrm', {}).get('meta', {}).get('thumbnailImage', thumb)

    new_bytes = {}  # bufferView index -> new image bytes
    for i, img in enumerate(gltf.get('images', [])):
        if 'bufferView' not in img:
            continue
        bv = gltf['bufferViews'][img['bufferView']]
        raw = binary[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        im = Image.open(io.BytesIO(raw))
        im.load()
        name = (img.get('name') or '').lower()
        limit = 256 if i == thumb else NORMAL_MAX if i in normal else max_size
        if max(im.size) > limit:
            s = limit / max(im.size)
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        has_alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255
        out = io.BytesIO()
        if has_alpha or i in normal or any(k in name for k in FACE) or max(im.size) <= 64:
            im.save(out, 'PNG', optimize=True)
            mime = 'image/png'
        else:
            im.convert('RGB').save(out, 'JPEG', quality=93, optimize=True, subsampling=0)
            mime = 'image/jpeg'
        if len(out.getvalue()) < len(raw):  # keep the original if it was already smaller
            new_bytes[img['bufferView']] = out.getvalue()
            img['mimeType'] = mime

    # rebuild the binary chunk with every bufferView in its new place
    parts, offset = [], 0
    for i, bv in enumerate(gltf['bufferViews']):
        start = bv.get('byteOffset', 0)
        chunk = new_bytes.get(i, binary[start:start + bv['byteLength']])
        bv['byteOffset'] = offset
        bv['byteLength'] = len(chunk)
        chunk = pad4(chunk)
        parts.append(chunk)
        offset += len(chunk)
    new_bin = b''.join(parts)
    gltf['buffers'][0]['byteLength'] = len(new_bin)

    js = pad4(json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode('utf-8'), b' ')
    total = 12 + 8 + len(js) + 8 + len(new_bin)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(new_bin), 0x004E4942)); f.write(new_bin)
    return len(data), total

if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit('usage: python tools/slim-vrm.py input.vrm output.vrm')
    before, after = slim(sys.argv[1], sys.argv[2])
    print(f'{sys.argv[2]}: {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB')
