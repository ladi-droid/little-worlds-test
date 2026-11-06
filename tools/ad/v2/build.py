import subprocess,os,json
from PIL import Image,ImageDraw,ImageFont
R='../rec/';P='../pclips/'
os.makedirs('seg',exist_ok=True);os.makedirs('cap',exist_ok=True)
# (out_start,out_end,src,src_start,speed,cx,cy,zoom,blur)
S=[(0.00,1.90,'westend',1.0,1,0.42,0.70,1.6,None),
(1.90,2.80,'B',70.0,1,0.5,0.55,1.25,None),
(2.80,3.70,'B',80.6,1,0.5,0.55,1.25,None),
(3.70,4.60,'B',87.2,1,0.5,0.55,1.25,None),
(4.60,5.80,'C',0.3,1,0.5,0.40,1.0,None),
(5.80,9.50,'C',2.0,4.9,0.5,0.45,1.0,None),
(9.50,11.10,'C',24.0,6.0,0.5,0.45,1.0,None),
(11.10,11.95,'westend',3.2,1,0.45,0.68,1.5,None),
(11.95,12.75,'olddubai',2.0,1,0.45,0.68,1.5,None),
(12.75,13.65,'capetown',2.0,1,0.45,0.68,1.5,None),
(13.65,14.65,'desert',2.0,1,0.45,0.68,1.5,None),
(14.65,16.75,'C',29.0,2.0,0.5,0.45,1.0,None),
(16.75,17.35,'D',1.5,1,0.5,0.5,1.0,None),
(17.35,18.35,'D',5.0,1.5,0.5,0.5,1.0,(0.215,0.38)),
(18.35,19.25,'D',7.4,3.0,0.5,0.5,1.0,None),
(19.25,20.05,'D',11.3,1,0.88,0.58,2.0,None),
(20.05,20.65,'C',86.5,1,0.5,0.45,1.0,None),
(20.65,21.25,'B',61.5,1,0.5,0.55,1.25,None),
(21.25,21.85,'B',72.5,1,0.5,0.55,1.25,None),
(21.85,22.45,'B',91.5,1,0.5,0.55,1.25,None),
(22.45,23.05,'downtown',1.0,1,0.45,0.68,1.5,None),
(23.05,23.85,'B',99.5,1,0.5,0.55,1.25,None),
(23.85,25.65,'C',48.0,4.4,0.5,0.45,1.0,None),
(25.65,29.00,'END',0,1,0.5,0.5,1.0,None)]
SRC={'B':(R+'B.mp4',1180,2556),'C':(R+'C.mp4',1180,2556),'D':(R+'D.mp4',1180,2556)}
def crop(W,H,cx,cy,z):
    w=W/z;h=w*1920/1080
    if h>H: h=H;w=h*1080/1920
    x=min(max(cx*W-w/2,0),W-w);y=min(max(cy*H-h/2,0),H-h)
    return int(w)//2*2,int(h)//2*2,int(x),int(y)
for i,(a,b,src,ss,sp,cx,cy,z,bl) in enumerate(S):
    d=b-a;out=f'seg/s{i:02d}.mp4'
    if src=='END':
        cmd=['ffmpeg','-v','error','-y','-loop','1','-framerate','30','-i','end.png','-t',f'{d:.3f}','-vf','fade=in:st=0:d=0.15:color=white,format=yuv420p']
    else:
        if src in SRC:
            f,W,H=SRC[src];inp=['-ss',f'{ss:.3f}','-t',f'{d*sp+0.5:.3f}','-i',f];pre='scale=1180:2556,setsar=1,'
        else:
            W,H=1080,2340;inp=['-framerate','30','-start_number',str(int(ss*30)),'-i',P+src+'/f%04d.jpg'];pre=''
        w,h,x,y=crop(W,H,cx,cy,z)
        v=f'{pre}setpts=(PTS-STARTPTS)/{sp},fps=30'
        if bl:
            y0=int(bl[0]*H);y1=int(bl[1]*H)
            v+=f',split[m][t];[t]crop={W}:{y1-y0}:0:{y0},boxblur=40:3[bb];[m][bb]overlay=0:{y0}'
        v+=f',crop={w}:{h}:{x}:{y},scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p'
        cmd=['ffmpeg','-v','error','-y',*inp,'-t',f'{d:.3f}','-vf',v,'-an']
    subprocess.run(cmd+['-r','30','-c:v','libx264','-crf','16','-preset','fast',out],check=True)
open('list.txt','w').write(''.join(f"file 'seg/s{i:02d}.mp4'\n" for i in range(len(S))))
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i','list.txt','-c','copy','body.mp4'],check=True)
# captions: (start,end,text,highlight words)
C=[(0.0,2.2,'this website turns your child','child'),(2.2,4.3,'into the star of their own video game','star'),
(4.6,5.75,'you put in their name','name'),(5.8,6.8,'pick their hair','hair'),(6.8,7.85,'their outfit','outfit'),(7.85,9.45,'even their trainers','trainers'),
(9.5,11.0,'then you choose where they go','choose'),(11.1,11.95,'London','London'),(11.95,12.75,'Dubai','Dubai'),(12.75,13.65,'Cape Town','Cape Town'),
(13.65,14.7,'bored of one?','bored'),(14.7,16.7,'add a new trip in a couple of taps','new trip'),
(16.9,18.3,'it saves to your home screen','home screen'),(18.3,19.3,'like a real app','real app'),(19.45,20.65,"and it's a proper game",'proper game'),
(21.1,22.25,'no ads','no ads'),(22.25,23.85,'nothing to buy inside','nothing'),(23.95,25.6,"it's called Little Worlds",'Little Worlds')]
F=ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf',84)
def cap(i,text,hl):
    im=Image.new('RGBA',(1080,600),(0,0,0,0));dr=ImageDraw.Draw(im)
    words=text.split();lines=[];cur=''
    for wd in words:
        t=(cur+' '+wd).strip()
        if dr.textlength(t,font=F)>900 and cur: lines.append(cur);cur=wd
        else: cur=t
    lines.append(cur)
    hlw=set(hl.lower().split())
    y=300-len(lines)*55
    for ln in lines:
        x=(1080-dr.textlength(ln,font=F))/2
        for wd in ln.split():
            col=(255,210,58) if wd.lower().strip('?,.') in hlw else (255,255,255)
            dr.text((x,y),wd,font=F,fill=col,stroke_width=9,stroke_fill=(11,11,14))
            x+=dr.textlength(wd+' ',font=F)
        y+=110
    im.save(f'cap/c{i:02d}.png')
for i,(a,b,t,h) in enumerate(C): cap(i,t,h)
inputs=['-i','body.mp4'];fl='';last='0:v'
for i,(a,b,t,h) in enumerate(C):
    inputs+=['-i',f'cap/c{i:02d}.png']
    fl+=f'[{last}][{i+1}:v]overlay=0:330:enable=\'between(t,{a},{b})\'[v{i}];';last=f'v{i}'
subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',fl.rstrip(';'),'-map',f'[{last}]','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart','silent2.mp4'],check=True)
print('ok')
