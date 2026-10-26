set -e
cd /home/claude/mealplan/v2/app
node -e "require('esbuild').buildSync({entryPoints:['test/test_main.js'],bundle:true,format:'iife',outfile:'test/app.test.js'})"
M=/tmp/claude-0/-home-claude/c9a46688-22ea-59ae-baa5-8f0f5f2c5b19/scratchpad/m
sed -e 's#<script src="firebase-config.js"></script>##' -e 's#app.js?v=__VERSION__#app.test.js#' public/index.html > $M/index.html
cp test/app.test.js $M/
rm -rf $M/data $M/fonts && cp -r public/data $M/data && cp -r public/fonts $M/fonts
MROOT=$M node test/mobile/shots.js $1
cd $1 && python3 -c "
from PIL import Image
import glob
fs=sorted(glob.glob('[0-9]*.png')); ims=[Image.open(f) for f in fs]
for k in range(0,len(ims),4):
  grp=ims[k:k+4]; s=0.45
  out=Image.new('RGB',(sum(int(i.size[0]*s)+10 for i in grp),int(max(i.size[1] for i in grp)*s)),'white'); x=0
  for i in grp:
    j=i.resize((int(i.size[0]*s),int(i.size[1]*s))); out.paste(j,(x,0)); x+=j.size[0]+10
  out.save('grid%d.png'%(k//4))
print(fs)"
