"""Build editable SVG artwork layers. No raster pixels are resampled/redrawn.
Edit each shape/source in scene.json, then run python3 tools/scene-layers/build.py.
The generated SVGs reference the original artwork plus hidden repair plates.
"""
import json, html
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/img/home/layers'
CONFIG=Path(__file__).with_name('scene.json')
BASE='/assets/img/home/lookout-valley.png'
DETAIL='/assets/img/home/lookout-valley-treetops.png'
UNDER='/assets/img/home/layers/terrain-repair.png'
CLOUD='/assets/img/home/layers/cloud-repair.png'

def image(src, mask=None):
    return f'<image href="{html.escape(src)}" x="0" y="0" width="1536" height="1024"'+(f' mask="url(#{mask})"' if mask else '')+'/>'
PADDING={}
def path(d,fill='white'):
    pad=PADDING.get(d,0)
    return f'<path fill="{fill}" stroke="{fill if pad else "none"}" stroke-width="{pad*2}" stroke-linejoin="round" d="{html.escape(d)}"/>'
def mask(mid,paths,exclude=(),full=False):
    return f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024">'+('<rect width="1536" height="1024" fill="white"/>' if full else '')+''.join(path(d) for d in paths)+''.join(path(d,'black') for d in exclude)+'</mask>'
def svg(defs,body):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" width="1536" height="1024"><defs>'+defs+'</defs>'+body+'</svg>\n'

def build():
    config=json.loads(CONFIG.read_text());items=config['layers'];OUT.mkdir(exist_ok=True)
    saved_path=OUT/'scene.json'
    saved={x['id']:x for x in json.loads(saved_path.read_text())['layers']} if saved_path.exists() else {}
    features=[x for x in items if x.get('paths')]
    PADDING.update({d:x.get('edgePadding',0) for x in features for d in x['paths']})
    allpaths=[d for x in features for d in x['paths']]
    # Partition the visible drawing. Every cutout has its own alpha mask;
    # upper silhouettes are removed from lower source layers, avoiding ghosts.
    for index,item in enumerate(items):
        uid=item['id'];defs='';body=''
        if item.get('type')=='repair': body=image(UNDER)
        elif item.get('type')=='landscape':
            defs=mask(uid+'-mask',[],allpaths,full=True)
            body=image(BASE,uid+'-mask')
        else:
            higher=[d for x in items[index+1:] for d in x.get('paths',[])]
            own=item['paths']
            defs=mask(uid+'-shape',own)+mask(uid+'-visible',own,higher)
            if item.get('category')=='clouds':
                # Clouds have painted continuation beneath occluding ridges.
                body=image(item.get('repairArtwork',CLOUD),uid+'-shape')
            if item.get('underpaint'):
                body+=image(UNDER,uid+'-shape')
            if item.get('category')=='cabin':
                body+='<g mask="url(#'+uid+'-shape)">'+''.join(path(d,'black') for x in items if x['id']=='window-light' for d in x.get('paths',[]))+'</g>'
            body+=image(item.get('artwork',BASE),uid+'-visible')
            if item.get('detail'):
                defs+=f'<filter id="{uid}-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.2"/></filter>'
                defs+=f'<mask id="{uid}-detail" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><g filter="url(#{uid}-soft)">'+''.join(path(d) for d in item['detail'])+'</g></mask>'
                body+='<g mask="url(#'+uid+'-visible)">'+image(item.get('detailArtwork',DETAIL),uid+'-detail')+'</g>'
        (OUT/(uid+'.svg')).write_text(svg(defs,body))
    manifest={'viewBox':[0,0,1536,1024],'crop':[0,430,1536,594],'layers':[{k:v for k,v in x.items() if k not in ('paths','detail')}|{'src':'/assets/img/home/layers/'+x['id']+'.svg','x':0,'y':0,'scale':1,'opacity':1,'visible':True}|{k:v for k,v in saved.get(x['id'],{}).items() if k in ('x','y','scale','opacity','visible')} for x in items]}
    (OUT/'scene.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Reproduce the approved pre-separation scene for the inspector's A/B view.
    ds=[d for x in items for d in x.get('detail',[])]
    de='<filter id="reference-soft"><feGaussianBlur stdDeviation="1.2"/></filter><mask id="reference-detail" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><g filter="url(#reference-soft)">'+''.join(path(d) for d in ds)+'</g></mask>'
    (OUT/'reference.svg').write_text(svg(de,image(BASE)+image(DETAIL,'reference-detail')))
    print(f'Built {len(items)} layers and comparison reference.')
if __name__=='__main__':build()
