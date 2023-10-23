import './style.css'
import { mat4, vec3 } from 'wgpu-matrix';
import { loadCreateShaderModule } from './helpers';
import {getVertexData} from './column';

const PARTICLE_WORKGROUP_SIZE : number = 8;
const PARTICLE_GRID_SIZE : number = 32;
const PARTICLE_TRACE_LENGTH = 20;

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

// Initialize data on host
const uniformSize : Float32Array = new Float32Array([PARTICLE_GRID_SIZE, PARTICLE_GRID_SIZE]);
const uniformDt : Float32Array = new Float32Array([UPDATE_INTERVAL / 1000.0]);
const uniformTraceLength : Int32Array = new Int32Array([PARTICLE_TRACE_LENGTH]);
const [vertexData, indexData] = getVertexData(PARTICLE_TRACE_LENGTH);

// Note a vec3 is 16 byte aligned
// This ordering requires less padding than the other way around
const particleInstanceByteSize =
    3 * 4 + // position (16 byte aligned)
    1 * 4 + // mass
    3 * 4 + // velocity
    1 * 4 + // lifetime
    3 * 4 + // color 
    1 * 4; // padding (Make sure particle struct is 16 byte aligned)
const numParticles = PARTICLE_GRID_SIZE * PARTICLE_GRID_SIZE * PARTICLE_TRACE_LENGTH;
// Array is initialized to 0
const particleStateArray : Float32Array = new Float32Array(numParticles * particleInstanceByteSize / 4);

for (let i = 0; i < particleStateArray.length; i += (particleInstanceByteSize / 4) * PARTICLE_TRACE_LENGTH) {
    particleStateArray[i] = Math.random() * 2 - 1; // x position
    particleStateArray[i + 1] = Math.random() * 2 - 1; // y position
    particleStateArray[i + 2] = Math.random() * 2 - 1; //z position
    particleStateArray[i + 3] = Math.random() * 0.1; // mass
    particleStateArray[i + 4] = (Math.random() * 2 - 1) * 0.1; // x velocity (scaled down
    particleStateArray[i + 5] = (Math.random() * 2 - 1) * 0.1; // y velocity
    particleStateArray[i + 6] = (Math.random() * 2 - 1) * 0.1; // z velocity
    particleStateArray[i + 7] = 0; // lifetime
    particleStateArray[i + 8] = Math.random(); // r
    particleStateArray[i + 9] = Math.random(); // g
    particleStateArray[i + 10] = Math.random(); // b
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

const traceLengthBuffer : GPUBuffer = device.createBuffer({
    label: "Trace Length Uniform",
    size: uniformTraceLength.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const mvpBuffer : GPUBuffer = device.createBuffer({
    label: "modelViewProjectionMatrix Uniform",
    size: mvp.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

const vertexBuffer : GPUBuffer = device.createBuffer({
    label: "Vertices",
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const indexBuffer : GPUBuffer = device.createBuffer({
    label: "Indices",
    size: indexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
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
device.queue.writeBuffer(traceLengthBuffer, 0, uniformTraceLength);
device.queue.writeBuffer(vertexBuffer, 0, vertexData);
device.queue.writeBuffer(indexBuffer, 0, indexData);
//device.queue.writeBuffer(particleStateBuffers[0], 0, particleStateArray);
device.queue.writeBuffer(particleStateBuffers[1], 0, particleStateArray);

// Define vertex buffer layout
const vertexBufferLayout : GPUVertexBufferLayout = {
    arrayStride: 8, // each vertex is 2 4-byte floats x, y
    attributes: [{ // each vertex has only a single id attribute
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
        buffer: { type: "uniform"} // Trace length uniform buffer
    }, {
        binding: 3,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage"} // MVP uniform buffer
    }, {
        binding: 4,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage"} // Particle state input buffer
    }, {
        binding: 5,
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
            resource: { buffer: traceLengthBuffer }
        }, {
            binding: 3,
            resource: { buffer: mvpBuffer }
        }, {
            binding: 4,
            resource: { buffer: particleStateBuffers[id] }
        }, {
            binding: 5,
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
        targets: [{format: canvasFormat}]
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

    const workgroupCount = Math.ceil(PARTICLE_GRID_SIZE / PARTICLE_WORKGROUP_SIZE);
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
    particleRenderPass.setIndexBuffer(indexBuffer, "uint16");
    particleRenderPass.setBindGroup(0, bindGroups[step % 2]);
    particleRenderPass.draw(vertexData.length / 2, PARTICLE_GRID_SIZE * PARTICLE_GRID_SIZE);
    
    particleRenderPass.end();

    device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);