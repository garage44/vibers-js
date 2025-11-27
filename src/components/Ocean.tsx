import { useRef, useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";

interface OceanProps {
  isDay?: boolean;
  sunLightRef?: React.RefObject<THREE.DirectionalLight | null>;
}

export function Ocean({ isDay = true, sunLightRef }: OceanProps) {
  const waterRef = useRef<Water>(null);
  const [normalMap, setNormalMap] = useState<THREE.Texture | null>(null);
  
  const OCEAN_SIZE = 5000;
  const OCEAN_HEIGHT = 0;

  // Load normal map texture
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      '/textures/waternormals.jpg',
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        setNormalMap(texture);
      },
      undefined,
      (error) => {
        console.error('Failed to load water normal map:', error);
        // Fallback to procedural texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(256, 256);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = 128;
          imageData.data[i + 1] = 128;
          imageData.data[i + 2] = 255;
          imageData.data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        const fallbackTexture = new THREE.CanvasTexture(canvas);
        fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
        setNormalMap(fallbackTexture);
      }
    );
  }, []);

  // Create water geometry - reduced segments for better performance
  const waterGeometry = useMemo(
    () => new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, 128, 128),
    []
  );

  // Create Water instance (only when normal map is loaded)
  const water = useMemo(() => {
    if (!normalMap) return null;

    const waterInstance = new Water(waterGeometry, {
      textureWidth: 256, // Reduced resolution for better performance
      textureHeight: 256,
      waterNormals: normalMap,
      sunDirection: new THREE.Vector3(),
      sunColor: isDay ? 0xffffff : 0xaaaaaa,
      waterColor: isDay ? 0x001e0f : 0x000510,
      distortionScale: 3.7,
      fog: false,
      alpha: 0.9,
    });

    waterInstance.rotation.x = -Math.PI / 2;
    waterInstance.position.y = OCEAN_HEIGHT;
    waterInstance.receiveShadow = true;

    return waterInstance;
  }, [waterGeometry, normalMap, isDay]);

  // Update water properties when isDay changes
  useEffect(() => {
    if (water && water.material instanceof THREE.ShaderMaterial) {
      const material = water.material;
      material.uniforms.waterColor.value.setHex(
        isDay ? 0x001e0f : 0x000510
      );
      material.uniforms.sunColor.value.setHex(
        isDay ? 0xffffff : 0xaaaaaa
      );
    }
  }, [water, isDay]);

  // Animate water and update sun direction
  useFrame((state, delta) => {
    if (water && water.material instanceof THREE.ShaderMaterial) {
      const material = water.material;
      // Update time uniform using delta for smooth animation
      material.uniforms.time.value += delta;

      // Update sun direction from sun light (throttle updates)
      if (sunLightRef?.current) {
        const light = sunLightRef.current;
        const sunPos = light.position.clone().normalize();
        material.uniforms.sunDirection.value.copy(sunPos);
        material.uniforms.sunColor.value.copy(light.color);
      }
    }
  });

  // Use primitive to render Water instance (only when loaded)
  if (!water) return null;
  
  return <primitive ref={waterRef} object={water} />;
}
