import './style.css'
import { mat4, vec3 } from 'wgpu-matrix';
import { loadCreateShaderModule } from './helpers';
import { vertices } from './quad';

const WORKGROUP_SIZE : number = 8;
const GRID_SIZE : number = 64;
const UPDATE_INTERVAL = 30;

const canvas : HTMLCanvasElement | null = document.getElementById("wgpu") as HTMLCanvasElement;
if (!canvas) throw new Error("No canvas found.");
let aspect = canvas.width / canvas.height;

// resize event
window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    aspect = canvas.width / canvas.height;
});

// Setup
if (!navigator.gpu) throw new Error("WebGPU not supported on this browser.");
const adapter : GPUAdapter | null = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("No appropriate GPUAdapter found.");

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

// Note a vec3 is 16 byte aligned
// This ordering requires less padding than the other way around
const particleInstanceByteSize =
    3 * 4 + // position
    1 * 4 + // mass
    3 * 4 + // velocity
    1 * 4; // padding (Make sure particle struct is 16 byte aligned)
const numParticles = GRID_SIZE * GRID_SIZE;
const particleStateArray : Float32Array = new Float32Array(numParticles * particleInstanceByteSize / 4);

for (let i = 0; i < particleStateArray.length; i += particleInstanceByteSize / 4) {
    particleStateArray[i] = Math.random() * 2 - 1; // x position
    particleStateArray[i + 1] = Math.random() * 2 - 1; // y position
    particleStateArray[i + 2] = Math.random() * 2 - 1; //z position
    particleStateArray[i + 3] = Math.random() * 0.1; // mass
    particleStateArray[i + 4] = 0.0; // x velocity
    particleStateArray[i + 5] = 0.0; // y velocity
    particleStateArray[i + 6] = 0.0; // z velocity
}

const getMVP = (aspect : number) : Float32Array => {
    const view = mat4.lookAt(vec3.fromValues(0, 0, 1), vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0)) as Float32Array;
    const projection = mat4.perspective(50 * Math.PI / 180, aspect, 0.1, 1000.0) as Float32Array;
    const mvp = mat4.identity() as Float32Array;

    mat4.multiply(projection, view, mvp);

    return mvp;
}

const mvp = getMVP(aspect);

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

const mvpBuffer : GPUBuffer = device.createBuffer({
    label: "modelViewProjectionMatrix Uniform",
    size: mvp.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

const vertexBuffer : GPUBuffer = device.createBuffer({
    label: "Vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const particleStateBuffers : GPUBuffer[] = ["A", "B"].map((label) => {
    return device.createBuffer({
        label: "Particle state " + label,
        size: particleInstanceByteSize * numParticles,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
});

// Copy data from host to device
device.queue.writeBuffer(sizeBuffer, 0, uniformSize);
device.queue.writeBuffer(dtBuffer, 0, uniformDt);
device.queue.writeBuffer(vertexBuffer, 0, vertices);
//device.queue.writeBuffer(particleStateBuffers[0], 0, particleStateArray);
device.queue.writeBuffer(particleStateBuffers[1], 0, particleStateArray);

// Define vertex buffer layout
const vertexBufferLayout : GPUVertexBufferLayout = {
    arrayStride: 20, // each vertex is 5 4-byte floats (x, y, y, u, v)
    attributes: [{ // each vertex has only a single attribute
        format: "float32x3",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
    },
    {
        format: "float32x2",
        offset: 12,
        shaderLocation: 1, // UV, see vertex shader
    
    }],
    stepMode : "vertex",
};

// Load & create shaders
let vertexShader : GPUShaderModule =
    await loadCreateShaderModule(device, "/shaders/vertex.wgsl", "Vertex shader");

const fragmentShader : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/fragment.wgsl", "Fragment shader");

// const potentialComputeShader : GPUShaderModule =
//     await loadCreateShaderModule(device, "/shaders/potential.wgsl", "Potential shader");

const motionComputeShader : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/motion.wgsl", "Motion shader");

// Bind group layouts
const bindGroupLayout : GPUBindGroupLayout = device.createBindGroupLayout({
    label: "Mass / Compute bind group layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type : "uniform"} // Size uniform buffer
    }, {
        binding: 1, 
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "uniform"} // Dt uniform buffer
    }, {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage"} // MVP uniform buffer
    }, {
        binding: 3,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage"} // Particle state input buffer
    }, {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer : { type: "storage" } // Particle state output buffer
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
            resource: { buffer: mvpBuffer }
        }, {
            binding: 3,
            resource: { buffer: particleStateBuffers[id] }
        }, {
            binding: 4,
            resource: { buffer: particleStateBuffers[(id + 1) % 2] }
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
            format: canvasFormat,
            blend : {
                color : {
                    srcFactor: "one",
                    dstFactor: "dst",
                    operation: "add",
                },
                alpha : {
                    srcFactor: "one",
                    dstFactor: "one",
                    operation: "add",
                }
            }
            
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

// const potentialPipeline = device.createComputePipeline({
//     label: "Potential pipeline",
//     layout: pipelineLayout,
//     compute: {
//         module: potentialComputeShader,
//         entryPoint: "main",
//     }
// });

let step = 0; // Track how many simulation steps have been run
function update() : void {
    step++;

    console.log("Step " + step);
    // update MVP
    device.queue.writeBuffer(mvpBuffer, 0, getMVP(aspect));

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
            // remove previous frame by 99% alpha
            loadOp: "clear",
            clearValue : {
                r: 0.0,
                g: 0.0,
                b: 0.0,
                a: 0.99,
            },
            storeOp: "store",
        }]
    });
    
    particleRenderPass.setPipeline(renderPipeline);
    particleRenderPass.setVertexBuffer(0, vertexBuffer);
    particleRenderPass.setBindGroup(0, bindGroups[step % 2]);
    particleRenderPass.draw(vertices.length / 5, GRID_SIZE * GRID_SIZE); // 9 vertices
    
    particleRenderPass.end();

    // // Compute potential
    // const potentialPass = encoder.beginComputePass();

    // potentialPass.setPipeline(potentialPipeline);
    // potentialPass.setBindGroup(0, bindGroups[step % 2]);

    // potentialPass.dispatchWorkgroups(workgroupCount, workgroupCount);
    // potentialPass.end();

    device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);