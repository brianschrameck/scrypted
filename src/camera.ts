import { AudioSensor, Battery, Camera, FFmpegInput, MediaObject, MediaStreamOptions, MotionSensor, PictureOptions, ResponseMediaStreamOptions, ScryptedDeviceBase, ScryptedMimeTypes, VideoCamera } from '@scrypted/sdk';
import sdk from '@scrypted/sdk';
import path from 'path';
import { ArloCameraPlugin } from './main';
import fs from 'fs';
import {BaseStationCameraSummary, BaseStationCameraStatus} from './base-station-api-client';

const { log, deviceManager, mediaManager } = sdk;

// use the dog.jpg from the fs directory that will be packaged with the plugin
const dogImage = fs.readFileSync('dog.jpg');

export class ArloCamera extends ScryptedDeviceBase implements AudioSensor, Battery, Camera, VideoCamera, MotionSensor {
    cameraSummary: BaseStationCameraSummary;
    cameraStatus: BaseStationCameraStatus;

    constructor(public plugin: ArloCameraPlugin, nativeId: string, cameraSummary: BaseStationCameraSummary, cameraStatus: BaseStationCameraStatus) {
        super(nativeId);
        this.cameraSummary = cameraSummary;
        this.cameraStatus = cameraStatus;
    }

    async takePicture(options?: PictureOptions): Promise<MediaObject> {
        return mediaManager.createMediaObject(dogImage, 'image/jpeg');
    }

    async getPictureOptions(): Promise<PictureOptions[]> {
        // can optionally provide the different resolutions of images that are available.
        // used by homekit, if available.
        return;
    }

    async getVideoStream(options?: MediaStreamOptions): Promise<MediaObject> {
        let ffmpegInput: FFmpegInput;

        const file = path.join(process.env.SCRYPTED_PLUGIN_VOLUME, 'zip', 'unzipped', 'fs', 'dog.mp4');

        ffmpegInput = {
            // the input doesn't HAVE to be an url, but if it is, provide this hint.
            url: undefined,
            inputArguments: [
                '-re',
                '-stream_loop', '-1',
                '-i', file,
            ]
        };

        return mediaManager.createMediaObject(Buffer.from(JSON.stringify(ffmpegInput)), ScryptedMimeTypes.FFmpegInput);
    }

    async getVideoStreamOptions(): Promise<ResponseMediaStreamOptions[]> {
        return [{
            id: 'stream',
            audio: null,
            video: {
                codec: 'h264',
            }
        }];
    }


    async startIntercom(media: MediaObject): Promise<void> {
        const ffmpegInput: FFmpegInput = JSON.parse((await mediaManager.convertMediaObjectToBuffer(media, ScryptedMimeTypes.FFmpegInput)).toString());
        // something wants to start playback on the camera speaker.
        // use their ffmpeg input arguments to spawn ffmpeg to do playback.
        // some implementations read the data from an ffmpeg pipe output and POST to a url (like unifi/amcrest).
        throw new Error('not implemented');
    }

    async stopIntercom(): Promise<void> {
    }

    // most cameras have have motion and doorbell press events, but dont notify when the event ends.
    // so set a timeout ourselves to reset the state.
    triggerMotion() {
        this.motionDetected = true;
        setTimeout(() => this.motionDetected = false, 10000);
    }
}