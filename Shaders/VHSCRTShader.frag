#define t iTime
vec2 iResolution = textureSize(InputTexture, 0);
vec2 res = (iResolution.xy / 3.0);
float hardScan = -float(CRThardScan);
float hardPix = -4.0;
float warpMX = float(warpMultX);
float warpMY = float(warpMultY);
vec2 warp = vec2(0.0, 0.0);		

// sRGB to Linear.
// Assuing using sRGB typed textures this should not be needed.
float ToLinearBase(float c)
{
	return (c <= 0.04045) ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
vec3 ToLinear(vec3 c)
{
	return vec3(ToLinearBase(c.r), ToLinearBase(c.g), ToLinearBase(c.b));
}

// Linear to sRGB.
// Assuing using sRGB typed textures this should not be needed.
float ToSrgbBase(float c)
{
	return (c < 0.0031308 ? c * 12.92 : 1.055 * pow(c, 0.41666) - 0.055);
}
vec3 ToSrgb(vec3 c)
{
	return vec3(ToSrgbBase(c.r), ToSrgbBase(c.g), ToSrgbBase(c.b));
}

// Nearest emulated sample given floating point position and texel offset.
// Also zero's off screen.
vec3 Fetch(vec2 pos,vec2 off)
{
	pos = floor(pos * res + off) / res;
	
	if (max(abs(pos.x - 0.5), abs(pos.y - 0.5)) > 0.5)
	{
		return vec3(0.0, 0.0, 0.0);
	}
	
	return ToLinear(texture(InputTexture, pos.xy, -16.0).rgb);
}

// Distance in emulated pixels to nearest texel.
vec2 Dist(vec2 pos)
{
	pos = pos * res;
	return -((pos - floor(pos)) - vec2(0.5));
}
	
// 1D Gaussian.
float Gaus(float pos,float scale)
{
	return exp2(scale * pos * pos);
}

// from rez in Glenz vector form Hell
float rand1(in vec2 p,in float t) 
{
	return fract(sin(dot(p + mod(t, 1.0), vec2(12.9898, 78.2333))) * 43758.5453);
}

// Film grain
float Grain(vec2 uv) 
{
    return 1.0 - grainIntensity + grainIntensity * rand1(uv,iTime);
}

// 3-tap Gaussian filter along horz line.
vec3 Horz3(vec2 pos,float off)
{
	vec3 b = Fetch(pos, vec2(-1.0, off));
	vec3 c = Fetch(pos, vec2(0.0, off));
	vec3 d = Fetch(pos, vec2(1.0, off));
	float dst = Dist(pos).x;
	
	// Convert distance to weight.
	float scale = hardPix;
	float wb = Gaus(dst - 1.0, scale);
	float wc = Gaus(dst + 0.0, scale);
	float wd = Gaus(dst + 1.0, scale);
	
	// Return filtered sample.
	return (b * wb + c * wc + d * wd) / (wb + wc + wd);
}

// 5-tap Gaussian filter along horz line.
vec3 Horz5(vec2 pos,float off)
{
	vec3 a = Fetch(pos,vec2(-2.0, off));
	vec3 b = Fetch(pos,vec2(-1.0, off));
	vec3 c = Fetch(pos,vec2(0.0, off));
	vec3 d = Fetch(pos,vec2(1.0, off));
	vec3 e = Fetch(pos,vec2(2.0, off));
	float dst = Dist(pos).x;
	
	// Convert distance to weight.
	float scale = hardPix;
	float wa = Gaus(dst - 2.0, scale);
	float wb = Gaus(dst - 1.0, scale);
	float wc = Gaus(dst + 0.0, scale);
	float wd = Gaus(dst + 1.0, scale);
	float we = Gaus(dst + 2.0, scale);
	
	// Return filtered sample.
	return (a * wa + b * wb + c * wc + d * wd + e * we) / (wa + wb + wc + wd + we);
}

// Return scanline weight.
float Scan(vec2 pos,float off)
{
	float dst = Dist(pos).y;
	
	return Gaus(dst + off, hardScan);
}

// Allow nearest three lines to effect pixel.
vec3 Tri(vec2 pos)
{
	vec3 a = Horz3(pos, -1.0);
	vec3 b = Horz5(pos, 0.0);
	vec3 c = Horz3(pos, 1.0);
	
	float wa = Scan(pos, -1.0);
	float wb = Scan(pos, 0.0);
	float wc = Scan(pos, 1.0);
	
	return a * wa + b * wb + c * wc;
}

// Distortion of scanlines, and end of screen alpha.
vec2 Warp(vec2 pos)
{
	if (warpEnable != 0)
	{
		warp = vec2(1.0 / warpMX, 1.0 / warpMY); 
	}

	pos = pos * 2.0 - 1.0;    
	pos *= vec2(1.0 + (pos.y * pos.y) * warp.x, 1.0 + (pos.x * pos.x) * warp.y);
	return pos * 0.5 + 0.5;
}

vec4 hash42(vec2 p)
{
	vec4 p4 = fract(vec4(p.xyxy) * vec4(443.8975,397.2973, 491.1871, 470.7827));
    p4 += dot(p4.wzxy, p4+19.19);
    return fract(vec4(p4.x * p4.y, p4.x*p4.z, p4.y*p4.w, p4.x*p4.w));
}

float hash( float n )
{
    return fract(sin(n)*43758.5453123);
}

float n( in vec3 x )
{
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0 + 113.0*p.z;
    float res = mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                        mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                    mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                        mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
    return res;
}

float nn(vec2 p)
{
    float y = p.y;
    float s = t*lineSpeed;
    
    float v = (n( vec3(y*.01 +s, 			1., 1.0) ) + .0)
          	 *(n( vec3(y*.011+1000.0+s, 	1., 1.0) ) + .0) 
          	 *(n( vec3(y*.51+421.0+s, 	1., 1.0) ) + .0);
 
   	v*= hash42(   vec2(p.x +t*0.001, p.y) ).x +.3 ;

    v = pow(v+.0005, 1.6);
	if(v<.5) v = 0.;
    return v;
}

float rand(vec2 co)
{
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

float verticalBar(float pos, float uvY, float offset)
{
    float edge0 = (pos - range);
    float edge1 = (pos + range);

    float x = smoothstep(edge0, pos, uvY) * offset;
    x -= smoothstep(pos, edge1, uvY) * offset;
    return x;
}

mat4 contrastMatrix( float contrast )
{
	float t = ( 1.0 - contrast ) / 2.0;
    
    return mat4( contrast, 0, 0, 0,
                 0, contrast, 0, 0,
                 0, 0, contrast, 0,
                 t, t, t, 1 );

}

mat4 saturationMatrix( float saturation )
{
    vec3 luminance = vec3( 0.3086, 0.6094, 0.0820 );
    
    float oneMinusSat = 1.0 - saturation;
    
    vec3 red = vec3( luminance.x * oneMinusSat );
    red+= vec3( saturation, 0, 0 );
    
    vec3 green = vec3( luminance.y * oneMinusSat );
    green += vec3( 0, saturation, 0 );
    
    vec3 blue = vec3( luminance.z * oneMinusSat );
    blue += vec3( 0, 0, saturation );
    
    return mat4( red,     0,
                 green,   0,
                 blue,    0,
                 0, 0, 0, 1 );
}

void main()
{
    vec2 uv = Warp(TexCoord.xy);
    
	vec2 offsetR = vec2(0.0, 0.0);
	vec2 offsetG = vec2(0.0, 0.0);
	
	float col = 0.0;
	
	if (VHSEnable != 0)
	{
		for (float i = 0.0; i < 0.71; i += 0.1313)
		{
			float d = mod(iTime * i, 1.7);
			float o = sin(1.0 - tan(iTime * 0.24 * i));
			o *= offsetIntensity;
			uv.x += verticalBar(d, uv.y, o);
		}
		
		float linesN = lineCount; //fields per seconds
		float one_y = iResolution.y / linesN; //field line
		col = nn(floor(uv*iResolution.xy/one_y)*one_y);
		
		float uvY = uv.y;
		uvY *= noiseQuality;
		uvY = float(int(uvY)) * (1.0 / noiseQuality);
		float noise = rand(vec2(iTime * 0.00001, uvY));
		uv.x += noise * noiseIntensity;
		
		offsetR = vec2(0.006 * sin(iTime), 0.0) * colorOffsetIntensity;
		offsetG = vec2(0.0073 * (cos(iTime * 0.97)), 0.0) * colorOffsetIntensity;
	}
    
	float r = texture(InputTexture, uv + offsetR).r;
	float g = texture(InputTexture, uv + offsetG).g;
	float b = texture(InputTexture, uv).b;
	
	vec4 tex = vec4(r, g, b, 1.0);

	if (lineEnable != 0 && VHSEnable != 0)
	{
		tex += vec4(vec3(col),1.0);
	}
	
	if (VHSEnable != 0 && CRTEnable != 0)
	{
		FragColor = tex * vec4(ToSrgb(Tri(uv) * Grain(uv)), 1.0);
	}
	if(VHSEnable != 0 && CRTEnable == 0)
	{
		FragColor = tex * vec4(vec3(Grain(uv)), 1.0);
	}
	if(VHSEnable == 0 && CRTEnable != 0)
	{
		FragColor = tex * vec4(ToSrgb(Tri(uv) * Grain(uv)), 1.0);
	}
	if(VHSEnable == 0 && CRTEnable == 0)
	{
		FragColor = tex * vec4(vec3(Grain(uv)), 1.0); 
	}
	
	if (CRTEnable != 0)
	{
		FragColor.a = 1.0;  
		FragColor.rgb = ToSrgb(FragColor.rgb);
	}
	
	FragColor *= contrastMatrix(contrast) * saturationMatrix(saturation);
}