import React from "react";

export function AxieImgUrl({ primary, fallback, alt, size=72 }:{
  primary?: string; 
  fallback?: string; 
  alt?: string; 
  size?: number;
}){
  const [src, setSrc] = React.useState(primary || fallback || "");
  
  React.useEffect(()=>{ 
    setSrc(primary || fallback || ""); 
  }, [primary, fallback]);
  
  return (
    <img
      src={src}
      alt={alt||"Axie"}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={()=>{ 
        if(src!==fallback && fallback) setSrc(fallback); 
      }}
      style={{ objectFit:"contain", borderRadius: 12 }}
    />
  );
}
