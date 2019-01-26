import reglInstance from './regl-instance';

import vec3 from 'gl-vec3';

import {
    random,
    pluckRandom,
    normedColor,
    normedColorStr
} from './utils';

import sphere from './models/sphere';
import {createCamera} from './models/camera';

import objectList from './dtos/objectList';

import vertShader from './shaders/vert.glsl';
import raytraceShader from './shaders/raytracer.glsl.js';

import 'normalize.css/normalize.css';
import './styles/index.scss';

async function app() {
    const canvas = document.getElementById('regl-canvas');
    const regl = await reglInstance({canvas});

    const camera = createCamera({
        lookFrom: [0.03, 0.9, 2.5],
        lookAt: [-0.2, 0.3, -1.5],
        vUp: [0, 1, 0],
        vfov: 30,
        aperture: 0.1,
        aspect: 2.0
    });

    const objects = new objectList([
        new sphere({
            id: 0,
            center: [0., -301, -5.],
            radius: 300.5,
            material: 'LambertMaterial',
            color: `
                float s = sin(10.*p.x)*sin(10.*p.y)*sin(10.*p.z);

                if(s < 0.) {
                    return vec3(${normedColorStr('#661111')});
                    //return vec3(${normedColorStr('#154535')});
                } else {
                    return vec3(${normedColorStr('#101010')});
                }
            `
        }),
        new sphere({
            center: [-0.2, 0.5, -1.7], // sphere center
            radius: 0.5,
            material: 'FuzzyMetalMaterial',
            color: '#ffffff'
        }),
        new sphere({
            center:[-1.5, 0.1, -1.25],
            radius: 0.5,
            material: 'GlassMaterial',
            color: '#ffffff'
        }),
        new sphere({
            center:[-0.35, -0.27, -1.], // '-0.27 + abs(sin(uTime*3.))*0.4'
            radius: 0.25,
            material: 'ShinyMetalMaterial',
            color: '#eeeeee'
        }),
        new sphere({
            center:[0.8, 0., -1.3],
            radius: 0.5,
            material: 'LambertMaterial',
            color: '#eeeeee'
        }),
        new sphere({
            center:[5.8, 5., -1.3],
            radius: 2.5,
            material: 'LightMaterial',
            color: `
                return vec3(5., 5., 5.);
            `
        }),
        new sphere({
            center:[-2.8, 5., -2.5],
            radius: 2.9,
            material: 'LightMaterial',
            color: `
                return vec3(5., 5., 5.);
            `
        })
    ]);

    // [...Array(3)].forEach((_, i) =>
    //     spheres.add(
    //         new sphere({
    //             id: 7+i,
    //             center:[-4.1 + random()*7.0, -0.2, -5.0 + random()*3.0],
    //             radius: 0.25, // radius
    //             material: 'FuzzyMetalMaterial', //pluckRandom(['LambertMaterial', 'FuzzyMetalMaterial']),
    //             color: '#353535'//'#451010' //'#ffffff'
    //         })
    //     )f
    // );

    let traceFbo = regl.framebuffer({
        color: [
            regl.texture({
                width: canvas.width,
                height: canvas.height,
                format: 'srgba',
                type: 'float',
                mag: 'nearest',
                min: 'nearest'
            })
        ],
        stencil: false,
        depth: false
    });

    let accumTexture = regl.texture({
        width: canvas.width,
        height: canvas.height,
        format: 'srgba',
        type: 'float',
        mag: 'nearest',
        min: 'nearest',
    });

    let rayTrace = regl({
        frag: raytraceShader({
            options: {
                glslCamera: false,
                numSamples: 1//300//800//1500
            },
            objectList: objects
        }),
        vert: vertShader,
        attributes: {
            position: [
                -2, 0,
                0, -2,
                2, 2
            ]
        },
        uniforms: {
            ...camera.getUniform(),
            'uBgGradientColors[0]': normedColor('#000000'),
            'uBgGradientColors[1]': normedColor('#111150'),
            'uSeed': regl.prop('seed'),
            'uTime': ({tick}) =>
                0.01 * tick,
            'uResolution': ({viewportWidth, viewportHeight}) =>
                [viewportWidth, viewportHeight]
        },
        depth: {
            enable: false
        },
        count: 3,
        framebuffer: traceFbo
    });

    let accumulate = regl({
        frag: `
            precision highp float;

            uniform vec2 uResolution;

            uniform sampler2D renderTexture;
            uniform sampler2D accumTexture;

            uniform int uCurrentSampleCount;
            uniform float uOneOverSampleCount;

            varying vec2 uv;

            void main() {
            	vec3 newSample = texture2D(renderTexture, uv).rgb;
                vec3 accumSamples = texture2D(accumTexture, uv).rgb;

                if(uCurrentSampleCount == 1) {
                    gl_FragColor = vec4(newSample*uOneOverSampleCount, 1.0);
                } else {
                    gl_FragColor = vec4(accumSamples + newSample*uOneOverSampleCount, 1.0);
                }
            }
        `,
        vert: vertShader,
        attributes: {
            position: [
                -2, 0,
                0, -2,
                2, 2
            ]
        },
        uniforms: {
            'renderTexture': () => traceFbo,
            'accumTexture': () => accumTexture,
            'uOneOverSampleCount': regl.prop('oneOverSampleCount'),
            'uCurrentSampleCount': regl.prop('currentSampleCount'),
            'uTime': ({tick}) =>
                0.01 * tick,
            'uResolution': ({viewportWidth, viewportHeight}) =>
                [viewportWidth, viewportHeight]
        },
        depth: {
            enable: false
        },
        count: 3,
    });


    // regl.clear({
    //     color: [0, 0, 0, 1]
    // });
    //
    // rayTrace();

    const maxSampleCount = 1000;
    let sampleCount = 1;
    const frame = regl.frame(() => {
        if(sampleCount > maxSampleCount) {
            console.log('done!');
            frame.cancel();
        }

        regl.clear({
            color: [0, 0, 0, 1]
        });

        rayTrace({
            seed: [random(0.1, 10), random(0.1, 10)]
        });

        accumulate({
            currentSampleCount: sampleCount, //sampleCount,
            oneOverSampleCount: 1/maxSampleCount
        });

        accumTexture({
            copy: true
        });

        ++sampleCount;
    })
};

document.addEventListener('DOMContentLoaded', app);
