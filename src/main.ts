import './style.css'
import { loadCreateShaderModule } from './wgpu/shader';

const WORKGROUP_SIZE : number = 8;
const GRID_SIZE : number = 256 ;
const UPDATE_INTERVAL = 30;
let step = 0; // Track how many simulation steps have been run

const canvas : HTMLCanvasElement | null = document.querySelector("canvas");
if (!canvas) throw new Error("No canvas found.");

// Setup
if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter : GPUAdapter | null = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device : GPUDevice = await adapter.requestDevice();
const canvasContext : GPUCanvasContext = canvas.getContext("webgpu") as GPUCanvasContext;
const canvasFormat : GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();
canvasContext.configure({
    device: device,
    format: canvasFormat,
});

// Non canvas render target
const massBufferTexture : GPUTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height},
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
});

const potentialBufferTexture : GPUTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height},
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
});

// Create views
const massBufferTextureView : GPUTextureView = massBufferTexture.createView();
const potentialBufferTextureView : GPUTextureView = potentialBufferTexture.createView();

// Initialize data on host
const uniformSize : Float32Array = new Float32Array([GRID_SIZE, GRID_SIZE]);

const uniformDt : Float32Array = new Float32Array([UPDATE_INTERVAL / 1000.0]);

const s : number = 1.0;
const vertices : Float32Array = new Float32Array([
    -s, -s, // Triangle 1
    s, -s,
    s,  s,
    -s, -s, // Triangle 2
    s,  s,
    -s,  s,
]);

const particleStateArray : Float32Array = new Float32Array(GRID_SIZE * GRID_SIZE * 4);
for (let i = 0; i < particleStateArray.length; i += 4) {
    particleStateArray[i] = i / 4 % GRID_SIZE / GRID_SIZE; // x
    particleStateArray[i + 1] = Math.floor(i / 4 / GRID_SIZE) / GRID_SIZE; // y
    particleStateArray[i + 2] = Math.random() * 0.1 - 0.05; // vx
    particleStateArray[i + 3] = Math.random() * 0.1 - 0.05; // vy
}

// Create Buffers
const sizeBuffer : GPUBuffer = device.createBuffer({
    label: "Size Uniform",
    size: uniformSize.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const dtBuffer : GPUBuffer = device.createBuffer({
    label: "Dt Uniform",
    size: uniformDt.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const vertexBuffer : GPUBuffer = device.createBuffer({
    label: "Vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const particleStateBuffers : GPUBuffer[] = [
    device.createBuffer({
        label: "Particle State A",
        size: particleStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
        label: "Particle State B",
        size: particleStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
];

// Copy data from host to device
device.queue.writeBuffer(sizeBuffer, 0, uniformSize);
device.queue.writeBuffer(dtBuffer, 0, uniformDt);
device.queue.writeBuffer(vertexBuffer, 0, vertices);
device.queue.writeBuffer(particleStateBuffers[0], 0, particleStateArray);
device.queue.writeBuffer(particleStateBuffers[1], 0, particleStateArray);

// Define vertex buffer layout
const vertexBufferLayout : GPUVertexBufferLayout = {
    arrayStride: 8, // each vertex is 2 32-bit floats (x, y)
    attributes: [{ // each vertex has only a single attribute
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
    }, {
        format: "float32x2",
        offset: Float32Array.BYTES_PER_ELEMENT * 3,
        shaderLocation: 1, // UV, see vertex shader
    }],
    stepMode : "vertex",
};

// Load & create shaders
const particlesVertexShader : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/particles-vert.wgsl", "Vertex shader");

const particlesFragmentShader : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/particles-frag.wgsl", "Fragment shader");

const forcesVertexShader : GPUShaderModule =
    await loadCreateShaderModule(device, "/shaders/forces-vert.wgsl", "Forces vertex shader");

const forcesFragmentShader : GPUShaderModule =
    await loadCreateShaderModule(device, "/shaders/forces-frag.wgsl", "Forces fragment shader");

const computeShaderModule : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/compute.wgsl", "Compute shader");

// Bind group layouts, can be used for both pipelines
const bindGroupLayout : GPUBindGroupLayout = device.createBindGroupLayout({
    label: "Bind group layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type : "uniform"} // Grid uniform buffer
      }, {
        binding: 1, 
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "uniform"} // Dt uniform buffer
      }, {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,

        binding: 3,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage"} // Particle state input buffer
      }, {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage"} // Particle state output buffer
      }]
});

// Bind groups: Connect buffer to shader, can be used for both pipelines
const bindGroups : GPUBindGroup[] = [
    device.createBindGroup({
        label: "Renderer bind group A",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: sizeBuffer }
        }, {
            binding: 1,
            resource: { buffer: dtBuffer }
        }, {
            binding: 2,
            resource: { buffer: particleStateBuffers[0] }
        }, {
            binding: 3,
            resource: { buffer: particleStateBuffers[1] }
        }],
      }),
    device.createBindGroup({
        label: "Renderer bind group B",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: sizeBuffer }
        }, {
            binding: 1,
            resource: { buffer: dtBuffer }
        }, {
            binding: 2,
            resource: { buffer: particleStateBuffers[1] }
        }, {
            binding: 3,
            resource: { buffer: particleStateBuffers[0] }
        }],
    })
]

// Pipeline layouts, can be used for both pipelines
const pipelineLayout : GPUPipelineLayout = device.createPipelineLayout({
    label: "Pipeline Layout",
    bindGroupLayouts: [ bindGroupLayout ],
});

// Pipelines
const renderPipeline : GPURenderPipeline = device.createRenderPipeline({
    label: "Renderer pipeline",
    layout: pipelineLayout,
    vertex: {
        module: particlesVertexShader,
        entryPoint: "main",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: particlesFragmentShader,
        entryPoint: "main", 
        targets: [{
            format: massBufferTexture.format
        }]
    }
});

const forcesPipeline : GPURenderPipeline = device.createRenderPipeline({
    label: "Forces pipeline",
    layout: pipelineLayout,
    vertex: {
        module: forcesVertexShader,
        entryPoint: "main",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: forcesFragmentShader,
        entryPoint: "main",
        targets: [{
            format: canvasFormat
        }]
    }
});

const computePipeline = device.createComputePipeline({
    label: "Compute pipeline",
    layout: pipelineLayout,
    compute: {
        module: computeShaderModule,
        entryPoint: "main",
    }
});

function update() : void {
    step++;

    console.log("Step " + step);

    const encoder : GPUCommandEncoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();

    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroups[step % 2]);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    const particleRenderPass : GPURenderPassEncoder = encoder.beginRenderPass({
        colorAttachments: [{
            view: massBufferTexture.createView(),
            loadOp: "clear",
            clearValue : [0.0, 0.0, 0.0, 1.0],
            storeOp: "store",
        }]
    });
    
    particleRenderPass.setPipeline(renderPipeline);
    particleRenderPass.setVertexBuffer(0, vertexBuffer);
    particleRenderPass.setBindGroup(0, bindGroups[step % 2]); // New line!
    particleRenderPass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices
    
    particleRenderPass.end();

    const forcesRenderPass : GPURenderPassEncoder = encoder.beginRenderPass({
        colorAttachments: [{
            view: canvasContext.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue : [0.0, 0.0, 0.0, 1.0],
            storeOp: "store",
        }]
    });

    forcesRenderPass.setPipeline(forcesPipeline);
    forcesRenderPass.setVertexBuffer(0, vertexBuffer);
    forcesRenderPass.draw(vertices.length / 2, 6);

    
    device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);