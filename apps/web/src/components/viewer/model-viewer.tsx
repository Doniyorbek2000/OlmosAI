'use client';

import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Bounds, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export interface ViewerStats {
  vertices: number;
  triangles: number;
  materials: number;
  meshes: number;
}

interface SceneModelProps {
  url: string;
  wireframe: boolean;
  onStats?: (stats: ViewerStats) => void;
}

function SceneModel({ url, wireframe, onStats }: SceneModelProps) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    let vertices = 0;
    let triangles = 0;
    let meshes = 0;
    const materials = new Set<THREE.Material>();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        meshes += 1;
        const pos = mesh.geometry.getAttribute('position');
        if (pos) vertices += pos.count;
        const index = mesh.geometry.getIndex();
        triangles += index ? index.count / 3 : (pos ? pos.count / 3 : 0);
        const mat = mesh.material as THREE.Material | THREE.Material[];
        (Array.isArray(mat) ? mat : [mat]).forEach((m) => materials.add(m));
      }
    });
    onStats?.({ vertices, triangles: Math.round(triangles), materials: materials.size, meshes });
  }, [scene, onStats]);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (m && 'wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
        });
      }
    });
  }, [scene, wireframe]);

  return <primitive object={scene} />;
}

interface ModelViewerProps {
  url: string;
  wireframe?: boolean;
  showGrid?: boolean;
  environment?: boolean;
  onStats?: (stats: ViewerStats) => void;
  className?: string;
}

/**
 * Professional WebGL viewport. Orbit/pan/zoom, auto-fit bounds, studio
 * lighting, optional ground grid + wireframe. Disposes GLTF resources on
 * unmount to avoid GPU memory leaks (spec §59).
 */
export function ModelViewer({
  url,
  wireframe = false,
  showGrid = true,
  environment = true,
  onStats,
}: ModelViewerProps) {
  useEffect(() => {
    return () => {
      // Free cached GLTF + GPU resources for this URL on unmount.
      useGLTF.clear(url);
    };
  }, [url]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [2.5, 2, 2.5], fov: 45 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#0a0b0d'));
      }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-5, 3, -5]} intensity={0.4} />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.2}>
          <SceneModel url={url} wireframe={wireframe} onStats={onStats} />
        </Bounds>
        {environment && <Environment preset="studio" />}
      </Suspense>
      {showGrid && (
        <Grid
          args={[20, 20]}
          cellColor="#23272e"
          sectionColor="#2e333b"
          fadeDistance={25}
          infiniteGrid
          position={[0, -0.001, 0]}
        />
      )}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.5}
        maxDistance={50}
      />
    </Canvas>
  );
}
