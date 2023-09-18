import './style.css'
import { loadCreateShaderModule } from './helpers';

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
// RENDER_ATTACHMENT: Texture can be used as a render target
// TEXTURE_BINDING: Texture can be used as a shader resource
const textures : GPUTexture[] = ["Mass", "Potential"].map((label) => {
    return device.createTexture({
        label: label + " texture",
        size: { width: canvas.width, height: canvas.height},
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
});

// Initialize data on host
const uniformSize : Float32Array = new Float32Array([GRID_SIZE, GRID_SIZE]);

const uniformDt : Float32Array = new Float32Array([UPDATE_INTERVAL / 1000.0]);

const s : number = 1.0;
const vertices : Float32Array = new Float32Array([
    // x, y, u, v
    -s, -s, // Triangle 1
    s, -s,
    s, s,
    -s, -s, // Triangle 2
    s, s,
    -s, s,
]);

const particleStateArray : Float32Array = new Float32Array(GRID_SIZE * GRID_SIZE * 5);
for (let i = 0; i < particleStateArray.length; i += 4) {
    particleStateArray[i] = i / 4 % GRID_SIZE / GRID_SIZE; // x position
    particleStateArray[i + 1] = Math.floor(i / 4 / GRID_SIZE) / GRID_SIZE; // y position
    particleStateArray[i + 2] = Math.random() * 0.1 - 0.05; // x velocity
    particleStateArray[i + 3] = Math.random() * 0.1 - 0.05; // y velocity
    particleStateArray[i + 4] = Math.random() * 0.1; // mass
}

const stencil : Float32Array = new Float32Array([
    0.0, 1.0, 0.0,
    1.0, -4.0, 1.0,
    0.0, 1.0, 0.0,
])

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

const stencilBuffer : GPUBuffer = device.createBuffer({
    label: "Stencil Uniform",
    size: stencil.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const vertexBuffer : GPUBuffer = device.createBuffer({
    label: "Vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const particleStateBuffers : GPUBuffer[] = ["A", "B"].map((label) => {
    return device.createBuffer({
        label: "Particle state " + label,
        size: particleStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
});

// Copy data from host to device
device.queue.writeBuffer(sizeBuffer, 0, uniformSize);
device.queue.writeBuffer(dtBuffer, 0, uniformDt);
device.queue.writeBuffer(stencilBuffer, 0, stencil);
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
    }],
    stepMode : "vertex",
};

// Load & create shaders
let vertexShader : GPUShaderModule =
    await loadCreateShaderModule(device, "/shaders/vertex.wgsl", "Vertex shader");

const fragmentShader : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/fragment.wgsl", "Fragment shader");

const potentialComputeShader : GPUShaderModule =
    await loadCreateShaderModule(device, "/shaders/potential.wgsl", "Potential shader");

const motionComputeShader : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/compute.wgsl", "Motion shader");

// Bind group layouts
const bindGroupLayout : GPUBindGroupLayout = device.createBindGroupLayout({
    label: "Mass / Compute bind group layout",
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
        buffer: { type: "uniform"} // Stencil uniform buffer
    }, {
        binding: 3,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage"} // Particle state input buffer
    }, {
        binding: 4,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        texture : { sampleType: "unfilterable-float" } // Particle state output texture
    }]
});

// Bind groups: Connect buffer to shader, can be used for both pipelines
const bindGroups : GPUBindGroup[] = [0, 1].map((id) => {
    return device.createBindGroup({
        label: "Mass / Compute bind group " + ["A", "B"][id],
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: sizeBuffer }
        }, {
            binding: 1,
            resource: { buffer: dtBuffer }
        }, {
            binding: 2,
            resource: { buffer: stencilBuffer }
        }, {
            binding: 3,
            resource: { buffer: particleStateBuffers[id] }
        }, {
            binding: 4,
            resource: textures[id].createView()
        }],
    });
});

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
        module: vertexShader,
        entryPoint: "main",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: fragmentShader,
        entryPoint: "main", 
        targets: [
        {
            format: textures[0].format
        }, {
            format: canvasFormat
        }]
    }
});

const motionPipeline = device.createComputePipeline({
    label: "Compute pipeline",
    layout: pipelineLayout,
    compute: {
        module: motionComputeShader,
        entryPoint: "main",
    }
});

const potentialPipeline = device.createComputePipeline({
    label: "Potential pipeline",
    layout: pipelineLayout,
    compute: {
        module: potentialComputeShader,
        entryPoint: "main",
    }
});

function update() : void {
    step++;

    console.log("Step " + step);

    const encoder : GPUCommandEncoder = device.createCommandEncoder();

    // Compute equations of motion
    const motionPass = encoder.beginComputePass();

    motionPass.setPipeline(motionPipeline);
    motionPass.setBindGroup(0, bindGroups[step % 2]);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    motionPass.dispatchWorkgroups(workgroupCount, workgroupCount);

    motionPass.end();

    // Render particles
    const particleRenderPass : GPURenderPassEncoder = encoder.beginRenderPass({
        colorAttachments: [{
            view: canvasContext.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue : [0.0, 0.0, 0.0, 1.0],
            storeOp: "store",
        }, {
            view: textures[0].createView(),
            loadOp: "clear",
            clearValue : [0.0, 0.0, 0.0, 1.0],
            storeOp: "store",
        }]
    });
    
    particleRenderPass.setPipeline(renderPipeline);
    particleRenderPass.setVertexBuffer(0, vertexBuffer);
    particleRenderPass.setBindGroup(0, bindGroups[step % 2]);
    particleRenderPass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices
    
    particleRenderPass.end();

    // Compute potential
    const potentialPass = encoder.beginComputePass();

    potentialPass.setPipeline(potentialPipeline);
    potentialPass.setBindGroup(0, bindGroups[step % 2]);

    potentialPass.dispatchWorkgroups(workgroupCount, workgroupCount);
    potentialPass.end();

    
    device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);