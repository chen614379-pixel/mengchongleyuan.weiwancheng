from PIL import Image
import os
src = r"D:\Users\CGQ\Documents\deepseek-harness\default-workspace\petbrawl\.weixin-minigame-helper\91c325f91173393a9ab6ad521702356c\shots\screenshot-1791800018641-rrnv43mt4k.png"
im = Image.open(src).convert("RGB")
W, H = im.size
print("SIZE", W, H)
sx, sy = W/1280.0, H/720.0
print("scale", round(sx,4), round(sy,4))
out = r"D:\Users\CGQ\Documents\deepseek-harness\default-workspace\petbrawl\work\crops"
os.makedirs(out, exist_ok=True)

def crop(x0,y0,x1,y1,name,scale=3):
    X0,Y0,X1,Y1 = int(x0*sx),int(y0*sy),int(x1*sx),int(y1*sy)
    c = im.crop((X0,Y0,X1,Y1))
    c = c.resize((c.width*scale, c.height*scale), Image.LANCZOS)
    c.save(os.path.join(out, name))
    print("saved", name, c.size)

crop(0, 80, 230, 545, "left_sidebar.png", 3)
crop(985, 80, 1275, 545, "right_sidebar.png", 3)
crop(270, 550, 1010, 720, "bench.png", 2)
# 全图缩略
im.resize((int(W*0.75), int(H*0.75)), Image.LANCZOS).save(os.path.join(out,"full.png"))
print("saved full.png")
