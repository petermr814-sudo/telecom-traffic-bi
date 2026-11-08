"""Check the actual offline DEM meshes, their geographic reference and topology."""
import json, math
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[1]/'public/geo/terrain'
manifest=json.loads((root/'manifest.json').read_text('utf-8'))
assert len(manifest['cities'])==60
for name, info in [('national',manifest['national']),*manifest['cities'].items()]:
    data=(root/info['file']).read_bytes()
    assert len(data)==info['vertices']*12+info['indices']*4, name
    v=np.frombuffer(data,dtype='<f4',count=info['vertices']*3).reshape(-1,3)
    i=np.frombuffer(data,dtype='<u4',offset=info['vertices']*12).reshape(-1,3)
    assert np.isfinite(v).all() and i.max()<len(v), name
    # Faces must point upwards; flipped DEM triangles disappear under front-face culling.
    cross=np.cross(v[i[:,1]]-v[i[:,0]],v[i[:,2]]-v[i[:,0]])
    assert (cross[:,1] >= -1e-7).all(),name
    assert np.ptp(v[:,1])>20, name
print('PASS: all 61 meshes have finite elevations, valid indices and upward topology')
d=manifest['dem'];a=np.frombuffer((root/d['file']).read_bytes(),dtype='<i2').reshape(d['height'],d['width'])
def elevation(lng,lat):
    size=256*2**d['zoom'];stride=d.get('pixelScale',1)
    x=round(((lng+180)/360*size-d['tileX']*256-.5)/stride)
    y=round(((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*size-d['tileY']*256-.5)/stride)
    return int(a[y,x])
assert 3400<elevation(91.13,29.65)<4200,'Lhasa highland location'
assert 350<elevation(104.07,30.66)<800,'Chengdu basin location'
assert -20<elevation(121.47,31.23)<80,'Shanghai coastal plain location'
print('PASS: sampled elevations match highland, basin and coastal plain locations')
for info in manifest['cities'].values():
    d=info['dem']
    assert (root/d['file']).stat().st_size==d['width']*d['height']*2
print('PASS: all 60 local DEM rasters match their georeferencing metadata')
