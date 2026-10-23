// Fixed in page coordinates, never animated: fibers stay still beneath the brush.
export const paperGLSL=`
float paperHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 paperAt(vec2 q,float surface){
  if(surface<.5)return vec3(1.0);
  float grain=paperHash(floor(q*1.2));
  float fiber=paperHash(floor(q*vec2(.12,2.6)));
  float crossFiber=paperHash(floor(q*vec2(2.4,.075)));
  float cloud=sin(q.x*.027+sin(q.y*.019)*1.5)*sin(q.y*.031)*.002;
  float tone=.978+(grain-.5)*.013+cloud;
  tone-=smoothstep(.95,1.0,fiber)*.014+smoothstep(.98,1.0,crossFiber)*.014;
  return vec3(tone);
}`;
