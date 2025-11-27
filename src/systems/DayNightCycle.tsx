import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky } from "@react-three/drei";

interface DayNightCycleProps {
  sunLightRef: React.RefObject<THREE.DirectionalLight | null>;
  ambientLightRef: React.RefObject<THREE.AmbientLight | null>;
  isDay: boolean; // true for day, false for night
}

export function DayNightCycle({
  sunLightRef,
  ambientLightRef,
  isDay,
}: DayNightCycleProps) {
  const skyRef = useRef<THREE.Mesh>(null);
  const sunMeshRef = useRef<THREE.Mesh>(null);
  const moonMeshRef = useRef<THREE.Mesh>(null);
  const { scene } = useThree();
  
  // Animated sun angle for smooth transitions
  const targetSunAngleRef = useRef(isDay ? Math.PI / 3 : (4 * Math.PI) / 3);
  const currentSunAngleRef = useRef(targetSunAngleRef.current);
  
  // Update target angle when isDay changes
  useEffect(() => {
    targetSunAngleRef.current = isDay ? Math.PI / 3 : (4 * Math.PI) / 3;
  }, [isDay]);

  useFrame((state, delta) => {
    // Smoothly interpolate current angle toward target angle
    const targetAngle = targetSunAngleRef.current;
    const currentAngle = currentSunAngleRef.current;
    const angleDiff = targetAngle - currentAngle;
    
    // Normalize angle difference to shortest path
    let normalizedDiff = angleDiff;
    if (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
    if (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;
    
    // Smooth transition speed (adjust for faster/slower transition)
    const transitionSpeed = 0.5; // radians per second
    const maxChange = transitionSpeed * delta;
    const change = Math.sign(normalizedDiff) * Math.min(Math.abs(normalizedDiff), maxChange);
    
    currentSunAngleRef.current = (currentAngle + change) % (Math.PI * 2);
    const sunAngle = currentSunAngleRef.current;
    
    // Calculate sun position from angle (circular arc in sky)
    // Using standard 2D circle: x = radius * cos(angle), y = radius * sin(angle)
    const sunRadius = 100;
    const sunPos = new THREE.Vector3(
      sunRadius * Math.cos(sunAngle),
      sunRadius * Math.sin(sunAngle),
      0 // Keep sun/moon in the X-Y plane (horizontal circle)
    );
    
    // Moon is opposite the sun (180 degrees offset)
    const moonAngle = sunAngle + Math.PI;
    const moonPos = new THREE.Vector3(
      sunRadius * Math.cos(moonAngle),
      sunRadius * Math.sin(moonAngle),
      0
    );

    // Calculate day/night factor based on sun angle (used for all transitions)
    // PI/3 (60°) = day, 4*PI/3 (240°) = night
    // Interpolate between day and night based on angle
    const dayAngle = Math.PI / 3;
    const nightAngle = (4 * Math.PI) / 3;
    let dayFactor = 0;
    
    // Calculate how close we are to day vs night
    if (sunAngle >= dayAngle && sunAngle < Math.PI) {
      // Between day and sunset
      dayFactor = 1 - (sunAngle - dayAngle) / (Math.PI - dayAngle);
    } else if (sunAngle >= Math.PI && sunAngle < nightAngle) {
      // Between sunset and night
      dayFactor = 0;
    } else if (sunAngle >= nightAngle) {
      // Between night and sunrise
      dayFactor = 0;
    } else {
      // Between sunrise and day
      dayFactor = sunAngle / dayAngle;
    }
    
    dayFactor = Math.max(0, Math.min(1, dayFactor)); // Clamp to [0, 1]

    // Update sun light position and properties
    // CRITICAL: For directional lights, position determines direction from sun to scene center
    // The light rays come FROM the light position TOWARD the target (scene center)
    if (sunLightRef.current) {
      const light = sunLightRef.current;
      
      // Set light position to sun's position - this makes light come FROM the sun
      light.position.set(sunPos.x, sunPos.y, sunPos.z);
      
      // Target is at scene center - light rays go from sun position toward center
      light.target.position.set(0, 0, 0);
      light.target.updateMatrixWorld();
      
      // Update the light's world matrix to ensure direction is correct
      light.updateMatrixWorld();
      
      // Update shadow camera to follow light direction
      light.shadow.camera.position.copy(light.position);
      light.shadow.camera.lookAt(light.target.position);
      light.shadow.camera.updateProjectionMatrix();

      // Sun color: warm during day, cool at night (moon light)
      // Using colors similar to threex.daynight, interpolate smoothly
      const sunWarm = new THREE.Color(1.0, 0.95, 0.8); // Warm sunlight (white-yellow)
      const moonCool = new THREE.Color(0.5, 0.6, 0.8); // Cool moonlight (blue-white)
      light.color.copy(sunWarm.clone().lerp(moonCool, 1 - dayFactor));

      // Sun intensity: bright during day, dim at night (moonlight)
      // Match threex.daynight intensity ranges, interpolate smoothly
      const dayIntensity = 1.0;
      const nightIntensity = 0.1;
      light.intensity = dayIntensity * dayFactor + nightIntensity * (1 - dayFactor);

    // Update visible sun mesh IMMEDIATELY after setting light position
    // Use the EXACT same sunPos vector to ensure perfect alignment
    if (sunMeshRef.current) {
      // Set position directly - no JSX prop to conflict with
      sunMeshRef.current.position.copy(sunPos);
      // Smoothly fade sun in/out based on dayFactor
      const sunScale = dayFactor * 3; // Scale from 0 to 3 based on dayFactor
      sunMeshRef.current.scale.setScalar(sunScale);
        
        // Force update matrix to ensure position is applied
        sunMeshRef.current.updateMatrixWorld();
        
        // Update sun material
        const sunMaterial = sunMeshRef.current.material as THREE.MeshStandardMaterial;
        if (sunMaterial && sunMaterial instanceof THREE.MeshStandardMaterial) {
          sunMaterial.color.setHex(0xffeb3b); // Bright yellow
          // Ensure emissive is a Color object
          if (!sunMaterial.emissive || !(sunMaterial.emissive instanceof THREE.Color)) {
            sunMaterial.emissive = new THREE.Color(0xffeb3b);
          } else {
            sunMaterial.emissive.setHex(0xffeb3b);
          }
          sunMaterial.emissiveIntensity = 2;
        }
      }
    }

    // Update ambient light intensity - match threex.daynight style
    // Use same dayFactor for smooth transitions
    if (ambientLightRef.current) {
      // More subtle ambient light, darker at night, interpolate smoothly
      const dayAmbientIntensity = 0.3;
      const nightAmbientIntensity = 0.1;
      ambientLightRef.current.intensity = dayAmbientIntensity * dayFactor + nightAmbientIntensity * (1 - dayFactor);
      
      // Adjust ambient color to match time of day, interpolate smoothly
      const dayAmbient = new THREE.Color(1.0, 1.0, 1.0);
      const nightAmbient = new THREE.Color(0.3, 0.3, 0.5); // Slight blue tint at night
      ambientLightRef.current.color.copy(dayAmbient.clone().lerp(nightAmbient, 1 - dayFactor));
    }

    // Update visible moon mesh
    if (moonMeshRef.current) {
      moonMeshRef.current.position.copy(moonPos);
      // Smoothly fade moon in/out based on dayFactor (inverse of sun)
      const moonScale = (1 - dayFactor) * 2.5; // Scale from 0 to 2.5 based on nightFactor
      moonMeshRef.current.scale.setScalar(moonScale);
      moonMeshRef.current.updateMatrixWorld();
      
      // Update moon material
      const moonMaterial = moonMeshRef.current.material as THREE.MeshStandardMaterial;
      if (moonMaterial && moonMaterial instanceof THREE.MeshStandardMaterial) {
        moonMaterial.color.setHex(0xe8e8e8); // Cool white
        // Ensure emissive is a Color object
        if (!moonMaterial.emissive || !(moonMaterial.emissive instanceof THREE.Color)) {
          moonMaterial.emissive = new THREE.Color(0xd0d0ff);
        } else {
          moonMaterial.emissive.setHex(0xd0d0ff);
        }
        moonMaterial.emissiveIntensity = 1.5;
      }
    }

    // Update sky sun position (drei Sky component)
    if (skyRef.current) {
      const skyMaterial = (skyRef.current as any).material;
      if (skyMaterial && skyMaterial.uniforms && skyMaterial.uniforms.sunPosition) {
        skyMaterial.uniforms.sunPosition.value.copy(sunPos);
      }
    }

    // Update scene background color - darker at night, interpolate smoothly
    const dayColor = new THREE.Color(0x87ceeb); // Sky blue
    const nightColor = new THREE.Color(0x050510); // Very dark blue/black
    scene.background = dayColor.clone().lerp(nightColor, 1 - dayFactor);
  });

  // Calculate initial positions for Sky component and initial setup
  const sunRadius = 100;
  const initialSunAngle = isDay ? Math.PI / 3 : (4 * Math.PI) / 3;
  const initialSunPos = new THREE.Vector3(
    sunRadius * Math.cos(initialSunAngle),
    sunRadius * Math.sin(initialSunAngle),
    0
  );
  const initialMoonAngle = initialSunAngle + Math.PI;
  const initialMoonPos = new THREE.Vector3(
    sunRadius * Math.cos(initialMoonAngle),
    sunRadius * Math.sin(initialMoonAngle),
    0
  );

  // Initialize sun and moon positions in useEffect to avoid JSX prop conflicts
  useEffect(() => {
    if (sunMeshRef.current) {
      sunMeshRef.current.position.copy(initialSunPos);
      sunMeshRef.current.updateMatrixWorld();
    }
    if (moonMeshRef.current) {
      moonMeshRef.current.position.copy(initialMoonPos);
      moonMeshRef.current.updateMatrixWorld();
    }
  }, [isDay, initialSunPos.x, initialSunPos.y, initialSunPos.z, initialMoonPos.x, initialMoonPos.y, initialMoonPos.z]);

  return (
    <>
      <Sky
        ref={skyRef}
        sunPosition={[initialSunPos.x, initialSunPos.y, initialSunPos.z]}
        turbidity={3}
        rayleigh={0.5}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
        distance={450000}
        sunScale={1}
      />
      {/* Visible Sun - position updated ONLY in useFrame to avoid conflicts */}
      <mesh ref={sunMeshRef}>
        <sphereGeometry args={[5, 32, 32]} />
        <meshStandardMaterial 
          color={0xffeb3b} 
          emissive={0xffeb3b} 
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      {/* Visible Moon - position updated ONLY in useFrame */}
      <mesh ref={moonMeshRef}>
        <sphereGeometry args={[4, 32, 32]} />
        <meshStandardMaterial 
          color={0xe8e8e8} 
          emissive={0xd0d0ff} 
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

