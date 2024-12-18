// Enhanced cleanup function with memory management
function performCleanup(fullCleanup = false) {
  const scene = document.querySelector('a-scene');
  const arSystem = scene?.systems['mindar-image-system'];
  
  // Clean up video resources
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (video && !video.paused) {
      video.pause();
      video.currentTime = 0;
      if (fullCleanup) {
        const src = video.src;
        video.src = '';
        video.load();
        // Reload video source after cleanup
        setTimeout(() => { video.src = src; }, 100);
      }
    }
  });

  // Clean up WebGL context and textures
  if (scene?.renderer) {
    const gl = scene.renderer.getContext();
    
    // Clean up WebGL textures
    const textures = scene.renderer.info.memory.textures || [];
    if (Array.isArray(textures)) {
      textures.forEach(texture => {
        if (texture && texture.dispose) {
          texture.dispose();
        }
      });
    }

    // Clean up WebGL buffers
    if (gl) {
      const numTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      for (let unit = 0; unit < numTextureUnits; unit++) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      }
      
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.warn('GC not available');
      }
    }
  }

  // Clean up AR system if needed
  if (fullCleanup && arSystem) {
    try {
      arSystem.stop();
      setTimeout(() => {
        arSystem.start();
      }, 1000);
    } catch (e) {
      console.warn('AR system cleanup error:', e);
    }
  }

  return Promise.resolve();
}

// Optimization system
const AROptimizer = {
  lastCleanup: Date.now(),
  errorCount: 0,
  isProcessing: false,
  
  initialize() {
    this.setupAutoCleanup();
    this.setupErrorHandling();
    this.setupMemoryMonitoring();
  },

  setupAutoCleanup() {
    // Light cleanup every 2 minutes
    setInterval(() => {
      if (!document.hidden && !this.isProcessing) {
        this.isProcessing = true;
        performCleanup(false)
          .finally(() => {
            this.isProcessing = false;
          });
      }
    }, 120000);

    // Full cleanup every 10 minutes
    setInterval(() => {
      if (!document.hidden && !this.isProcessing) {
        this.isProcessing = true;
        performCleanup(true)
          .finally(() => {
            this.isProcessing = false;
          });
      }
    }, 600000);
  },

  setupErrorHandling() {
    const scene = document.querySelector('a-scene');
    if (!scene) return;

    scene.addEventListener('arError', async () => {
      this.errorCount++;
      
      if (this.errorCount > 3) {
        await performCleanup(true);
        this.errorCount = 0;
      } else {
        await performCleanup(false);
      }

      setTimeout(() => {
        this.errorCount = Math.max(0, this.errorCount - 1);
      }, 300000);
    });
  },

  setupMemoryMonitoring() {
    if ('memory' in performance) {
      setInterval(() => {
        const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
        if (usedJSHeapSize > jsHeapSizeLimit * 0.8) {
          if (!this.isProcessing) {
            this.isProcessing = true;
            performCleanup(true)
              .finally(() => {
                this.isProcessing = false;
              });
          }
        }
      }, 30000);
    }
  }
};

AFRAME.registerComponent('target-handler', {
  init: function () {
    const mindarScene = this.el.sceneEl;

    // Handle target found
    this.el.addEventListener('targetFound', () => {
      console.log(`Target found for ID: ${this.el.getAttribute('data-id')}`);

      // Handle <a-gltf-model>
      const gltfElement = this.el.querySelector('a-gltf-model');
      if (gltfElement) {
        gltfElement.setAttribute('visible', 'true');
      }
    });

    // Handle target lost
    this.el.addEventListener('targetLost', () => {
      console.log(`Target lost for ID: ${this.el.getAttribute('data-id')}`);

      // Handle <a-gltf-model>
      const gltfElement = this.el.querySelector('a-gltf-model');
      if (gltfElement) {
        gltfElement.setAttribute('visible', 'false');
      }
    });
  }
});

// Register video material component
AFRAME.registerComponent('video-material', {
  schema: {
    video: { type: 'selector' }
  },

  init: function () {
    const video = document.querySelector('#vid1');
    const videoEntity = document.querySelector('#videoEntity');

    const mindarScene = this.el;

    if (!video || !videoEntity) {
      console.error('Video or video entity is missing');
      return;
    }

    // Set up Three.js video texture
    video.addEventListener('play', () => {
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat; // Ensure the format matches the video content
      videoTexture.generateMipmaps = false;

      const material = new THREE.MeshBasicMaterial({ map: videoTexture });
      const mesh = videoEntity.getObject3D('mesh');
      if (mesh) {
        mesh.material = material;
      } else {
        console.warn('Mesh not found on video entity');
      }
    });

    // Handle target found
    mindarScene.addEventListener('targetFound', () => {
      console.log('Target found!');
      videoEntity.setAttribute('visible', 'true');
      video.play().catch((error) => {
        console.warn('Video playback failed:', error);
      });
    });

    // Handle target lost
    mindarScene.addEventListener('targetLost', () => {
      console.log('Target lost!');
      videoEntity.setAttribute('visible', 'false');
      video.pause();
    });
  },
});

document.addEventListener('DOMContentLoaded', function() {
  const loadingProgress = document.getElementById('loading-progress');
  const loadingScreen = document.getElementById('loading-screen');
  const arScene = document.getElementById('ar-scene');
  const scene = document.querySelector('a-scene');
  
  // Initialize scene settings
  loadingScreen.style.display = 'flex';
  loadingProgress.style.display = 'block';
  scene.renderer.setClearColor(0x000000, 0);
  scene.object3D.background = null;

  // Initialize AR Optimizer
  AROptimizer.initialize();

  // Camera initialization with enhanced error handling
  setTimeout(() => {
    loadingProgress.textContent = 'Запуск камери...';
    
    navigator.mediaDevices.getUserMedia({ 
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    })
    .then(function(stream) {
      stream.getTracks().forEach(track => track.stop());
      
      scene.addEventListener('arReady', function() {
        loadingScreen.style.display = 'none';
        loadingProgress.style.display = 'none';
        arScene.classList.add('ready');
      });
    })
    .catch(function(err) {
      console.error('Camera initialization error:', err);
      loadingProgress.textContent = 'Відмовлено в дозволі на камеру';
    });
  }, 0);
});

// Enhanced visibility change handling
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    performCleanup(true);
  }
});

// Additional cleanup handlers
window.addEventListener('beforeunload', () => performCleanup(true));
window.addEventListener('pagehide', () => performCleanup(true));