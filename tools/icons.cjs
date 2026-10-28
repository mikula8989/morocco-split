const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'../docs');
Promise.all([192,512].map(size=>sharp(fs.readFileSync(path.join(root,'icon.svg'))).resize(size,size).png().toFile(path.join(root,`icon-${size}.png`)))).then(()=>console.log('PWA icons ready'));
