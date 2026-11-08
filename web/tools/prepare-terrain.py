"""Build offline geographic terrain from Mapzen Terrain Tiles, not synthetic noise.

pip install numpy pillow requests scipy shapely
Source/encoding: https://github.com/tilezen/joerd/blob/master/docs/formats.md
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import json, math, os, time
import numpy as np
import requests
from PIL import Image
from scipy.ndimage import map_coordinates
from scipy.spatial import Delaunay
import shapely
from shapely.geometry import shape, box, Polygon
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/geo/terrain'
CACHE = ROOT / '.cache/terrain-tiles'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
PROXY = os.environ.get('HTTPS_PROXY')
FEATURES = json.loads((ROOT/'public/geo/provinces-detail.json').read_text('utf-8'))['features']
CITIES = json.loads((ROOT/'public/geo/cities.json').read_text('utf-8'))['features']
def merc(lat): return np.degrees(np.arcsinh(np.tan(np.radians(lat))))
ORIGIN = float(merc(36))
def project(x,y,z=None): return (np.asarray(x)-104.5)*1.12, (merc(np.asarray(y))-ORIGIN)*1.12
def lnglat(x,y): return x/1.12+104.5, np.degrees(np.arctan(np.sinh(np.radians(y/1.12+ORIGIN))))
def tile_bounds(bounds,z):
    w,s,e,n=bounds; size=2**z
    return (int((w+180)/360*size),int((1-float(merc(n))/180)/2*size),int((e+180)/360*size),int((1-float(merc(s))/180)/2*size))
def keys(bounds,z):
    x0,y0,x1,y1=tile_bounds(bounds,z)
    return [(z,x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]
def fetch_tile(key):
    z,x,y=key; path=CACHE/f'{z}-{x}-{y}.png'
    if path.exists(): return
    for attempt in range(4):
        try:
            r=requests.get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', timeout=45, proxies={'https':PROXY} if PROXY else None)
            r.raise_for_status()
            with Image.open(BytesIO(r.content)) as im:
                if im.size != (256,256): raise ValueError('Invalid DEM tile')
                im.verify()
            path.write_bytes(r.content); return
        except Exception:
            if attempt==3: raise
            time.sleep(attempt+1)
class Raster:
    def __init__(self,bounds,z):
        self.z=z; self.x0,self.y0,x1,y1=tile_bounds(bounds,z)
        self.data=np.zeros(((y1-self.y0+1)*256,(x1-self.x0+1)*256),dtype=np.float32)
        for yy in range(self.y0,y1+1):
            for xx in range(self.x0,x1+1):
                rgb=np.asarray(Image.open(CACHE/f'{z}-{xx}-{yy}.png'),dtype=np.float32)
                h=rgb[:,:,0]*256+rgb[:,:,1]+rgb[:,:,2]/256-32768
                self.data[(yy-self.y0)*256:(yy-self.y0+1)*256,(xx-self.x0)*256:(xx-self.x0+1)*256]=h
    def sample(self,coords):
        lng,lat=lnglat(coords[:,0],coords[:,1]); size=256*2**self.z
        x=(lng+180)/360*size-self.x0*256-.5
        y=(1-merc(lat)/180)/2*size-self.y0*256-.5
        return map_coordinates(self.data,[y,x],order=1,mode='nearest')
    def save(self,name):
        stride=max(1,int(math.ceil(max(self.data.shape)/(1024 if name=='national' else 512))))
        data=np.rint(self.data[::stride,::stride]).astype('<i2')
        (OUT/f'{name}-dem.bin').write_bytes(data.tobytes())
        return {'file':f'{name}-dem.bin','zoom':self.z,'tileX':self.x0,'tileY':self.y0,'pixelScale':stride,'width':data.shape[1],'height':data.shape[0]}
def parts(g): return [g] if g.geom_type=='Polygon' else list(g.geoms)
def mesh(polys,raster,step,name):
    vertices=[]; indices=[]; count=0
    for poly in polys:
        if poly.is_empty or poly.area < 0.000002: continue
        poly=shapely.make_valid(poly)
        if poly.geom_type!='Polygon':
            for p in parts(poly):
                if p.geom_type=='Polygon': pass
            continue
        rings=[np.asarray(poly.exterior.coords)[:,:2]]+[np.asarray(h.coords)[:,:2] for h in poly.interiors]
        # Densify actual boundaries so terrain contours sample the same DEM as the surface.
        border=[]
        for ring in rings:
            for a,b in zip(ring[:-1],ring[1:]):
                n=max(1,int(np.ceil(np.linalg.norm(b-a)/step)))
                border.extend(a+(b-a)*t/n for t in range(n))
        x0,y0,x1,y1=poly.bounds
        xx,yy=np.meshgrid(np.arange(x0+step/2,x1,step),np.arange(y0+step/2,y1,step))
        grid=np.column_stack((xx.ravel(),yy.ravel()))
        grid=grid[shapely.contains_xy(poly,grid[:,0],grid[:,1])]
        points=np.unique(np.round(np.vstack([np.asarray(border),grid]),7),axis=0)
        if len(points)<3:continue
        tri=Delaunay(points).simplices
        triangles=shapely.polygons(points[tri])
        domain=poly.buffer(0.000001)
        shapely.prepare(domain)
        tri=tri[shapely.covers(domain,triangles)]
        if not len(tri): continue
        # CCW in x/north maps to upward normals in x/y/-north.
        h=raster.sample(points)
        vertices.append(np.column_stack((points[:,0],h,-points[:,1])).astype('<f4'))
        indices.append((tri+count).astype('<u4'));count+=len(points)
    if not vertices:raise ValueError(f'No terrain geometry: {name}')
    print(f'Writing {name}: {count} vertices',flush=True)
    v=np.vstack(vertices);i=np.vstack(indices).ravel()
    # Float32 quantization can flip nearly-collinear boundary triangles.
    faces=i.reshape(-1,3)
    winding=np.cross(v[faces[:,1]]-v[faces[:,0]],v[faces[:,2]]-v[faces[:,0]])[:,1]
    faces[winding<0]=faces[winding<0][:,[0,2,1]]
    i=faces[np.abs(winding)>1e-10].astype('<u4').ravel()
    (OUT/f'{name}.bin').write_bytes(v.tobytes()+i.tobytes())
    return {'file':f'{name}.bin','vertices':len(v),'indices':len(i),'minElevation':float(v[:,1].min()),'maxElevation':float(v[:,1].max())}

national_bounds=(72,17,136,54)
national_polys=[]
for feature in FEATURES:
    if not feature['properties'].get('name'):continue
    for p in parts(shape(feature['geometry'])):
        if p.bounds[3]>=18:national_polys.append(transform(project,p))
nation=shapely.union_all(national_polys)
regions=[]
for f in CITIES:
    g=transform(project,shape(f['geometry']));x0,y0,x1,y1=g.bounds
    # Keep enough neighbouring terrain for the complete camera frame.
    span=max(x1-x0,y1-y0,1.25);cx=(x0+x1)/2;cy=(y0+y1)/2
    region=box(cx-span*1.2,cy-span*1.2,cx+span*1.2,cy+span*1.2)
    a,b,c,d=region.bounds;w,s=lnglat(a,b);e,n=lnglat(c,d)
    regions.append((f,g,region,(float(w),float(s),float(e),float(n))))
needed=set(keys(national_bounds,6))
for _,_,_,bounds in regions:needed.update(keys(bounds,9))
print(f'Downloading/verifying {len(needed)} actual elevation tiles',flush=True)
with ThreadPoolExecutor(max_workers=12) as pool:
    futures=[pool.submit(fetch_tile,k) for k in needed]
    for idx,future in enumerate(as_completed(futures),1):
        future.result()
        if idx%100==0:print(f'Tiles {idx}/{len(needed)}',flush=True)
raster=Raster(national_bounds,6)
manifest={'source':'Mapzen Terrain Tiles / AWS Open Data','encoding':'Terrarium RGB -> elevation metres','sourceUrl':'https://registry.opendata.aws/terrain-tiles/','projection':'Web Mercator, centre 104.5E 36N','verticalExaggeration':24,'national':mesh(national_polys,raster,.055,'national'),'dem':raster.save('national'),'cities':{}}
for idx,(f,g,region,bounds) in enumerate(regions):
    city=f['properties']['name'];code=str(f['properties']['adcode'])
    detail=Raster(bounds,9)
    clipped=shapely.intersection(nation,region)
    a,b,c,d=region.bounds;step=max(c-a,d-b)/210
    info=mesh(parts(clipped),detail,step,f'city-{code}')
    info['dem']=detail.save(f'city-{code}')
    info['bounds']=list(region.bounds)
    manifest['cities'][city]=info
    print(f'{idx+1}/60 {city}: {info["vertices"]} vertices',flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False),'utf-8')
print('Terrain build complete',flush=True)
