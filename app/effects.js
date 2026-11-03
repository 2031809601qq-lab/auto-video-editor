const templates = {
  clean: { name: '清爽口播', description: '原声、干净画面，转折处轻微推近', effects: ['none', 'punch', 'warm'] },
  emphatic: { name: '观点强调', description: '高对比开场，论点出现时闪白或震动', effects: ['punch', 'flash', 'shake', 'contrast'] },
  story: { name: '故事讲述', description: '暖色、暗角和柔和开场', effects: ['warm', 'vignette', 'fade'] },
  cool: { name: '理性拆解', description: '冷调、黑白与重点放大', effects: ['cool', 'mono', 'punch'] }
};
const effects = {
  none: { name: '无动效', filter: '' },
  punch: { name: '开场推近', filter: "zoompan=z='min(1.16,1+0.16*min(on/18,1))':d=1:s=1080x1920:fps=60" },
  flash: { name: '开场闪白', filter: "eq=brightness='if(lt(t,0.12),0.2,0)':eval=frame" },
  shake: { name: '短震动', filter: "scale=1120:1992,crop=1080:1920:x='20+if(lt(t,0.3),8*sin(n*2),0)':y='36+if(lt(t,0.3),8*cos(n*2),0)'" },
  contrast: { name: '高对比', filter: 'eq=contrast=1.13:saturation=1.08' },
  warm: { name: '暖色', filter: 'colorbalance=rs=.05:bs=-.04' },
  cool: { name: '冷色', filter: 'colorbalance=rs=-.04:bs=.06' },
  mono: { name: '黑白', filter: 'hue=s=0' },
  vignette: { name: '暗角', filter: 'vignette=PI/5' },
  fade: { name: '柔和开场', filter: 'fade=t=in:st=0:d=0.35' }
};
function videoFilter(effect = 'none') {
  if (!effects[effect]) throw Error(`未知动效：${effect}`);
  const base = 'fps=60,scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1';
  return [base, effects[effect].filter, 'format=yuv420p'].filter(Boolean).join(',');
}
module.exports = { templates, effects, videoFilter };
