import { Battery, Camera, FFmpegInput, MediaObject, PictureOptions, RequestMediaStreamOptions, ResponseMediaStreamOptions, ScryptedDeviceBase, ScryptedInterface, Setting, Settings, SettingValue, VideoCamera } from '@scrypted/sdk';
import sdk from '@scrypted/sdk';
import { ArloCameraPlugin } from './main';
import net from 'net';
import child_process from "child_process";
import { BaseStationCameraSummary, BaseStationCameraStatus } from './base-station-api-client';
import { listenZero } from '@scrypted/common/src/listen-cluster'
const { mediaManager } = sdk;

export class ArloCamera extends ScryptedDeviceBase implements Camera, VideoCamera, Settings {
    pendingPicture: Promise<MediaObject>;
    cameraSummary: BaseStationCameraSummary;
    cameraStatus: BaseStationCameraStatus;
    sdp: Promise<string>;

    constructor(public plugin: ArloCameraPlugin, nativeId: string, cameraSummary: BaseStationCameraSummary, cameraStatus: BaseStationCameraStatus) {
        super(nativeId);
        this.cameraSummary = cameraSummary;
        this.cameraStatus = cameraStatus;
    }

    /** Camera */

    // implement
    async takePicture(option?: PictureOptions): Promise<MediaObject> {
        return;
    }

    // implement
    async getPictureOptions(): Promise<PictureOptions[]> {
        return;
    }

    async takePictureThrottled(option?: PictureOptions): Promise<MediaObject> {
        // TODO: implement this
        return;
    }

    /** VideoCamera */

    // implement
    async getVideoStreamOptions(): Promise<ResponseMediaStreamOptions[]> {
        return [{
            id: 'channel0',
            name: 'Stream 1',
            video: {
                codec: 'h264'
            },
            audio: this.isAudioDisabled() ? null : {
                codec: 'aac'
            },
        }];
    }

    // implement
    async getVideoStream(options?: RequestMediaStreamOptions): Promise<MediaObject> {
        const gstreamerPort = Math.round(Math.random() * 30000 + 30000);

        // build the gstreamer command
        let gstArgs: string[] = [];
        if (this.getGStreamerInput) {
            gstArgs = this.getGStreamerInput().split(' ');
        } else {
            gstArgs.push(
                // set up the RTSP source from the camera
                'rtspsrc', `location=rtsp://${this.cameraSummary.ip}/live`, 'name=arlo',
                // parse the h264 video stream and push it to our sink
                'arlo.', '!', 'rtph264depay', '!', 'h264parse', '!', 'queue', '!', 'mux.');
            if (!this.isAudioDisabled()) {
                // parse the aac audio stream and push it to our sink
                gstArgs.push('arlo.', '!', 'rtpmp4gdepay', '!', 'aacparse', '!', 'queue', '!', 'mux.');
            }
            // configure our mux to mpegts and TCP sink to FFMPEG
            gstArgs.push('mpegtsmux', 'name=mux', '!', 'tcpserversink', 'host=127.0.0.1', `port=${gstreamerPort}`);
        }

        // launch the command to start the stream
        this.console.info('Starting GStreamer pipeline; command: gst-launch-1.0 ' + gstArgs.join(' '));
        const cp = child_process.spawn('gst-launch-1.0', gstArgs);
        cp.stdout.on('data', data => this.console.log(data.toString()));
        cp.stderr.on('data', data => this.console.log(data.toString()));

        // build the ffmpeg command
        let ffmpegArgs: string[] = [];
        if (this.getFfmpegInput) {
            ffmpegArgs = this.getFfmpegInput().split(' ');
        } else {
            ffmpegArgs = [
                '-loglevel',
                'trace',
                '-f',
                'mpegts',
                '-i',
                `tcp://127.0.0.1:${gstreamerPort}`
            ];
        }

        // return the ffmpeg input that should contain the output of the gstreamer pipeline
        const ret: FFmpegInput = {
            url: undefined,
            inputArguments: ffmpegArgs,
            mediaStreamOptions: { id: options.id ?? 'channel0', ...options },
        };

        return mediaManager.createFFmpegMediaObject(ret);
    }

    /** Settings */

    // implement
    async getSettings(): Promise<Setting[]> {
        return [
            {
                key: 'gStreamerInput',
                title: 'GStreamer Input Stream Override',
                description: 'Optional override of GStreamer input arguments passed to the command line gst-launch-1.0 tool.',
                placeholder: 'rtspsrc location=rtsp://192.168.1.100/live ...',
                value: this.getGStreamerInput(),
            },
            {
                key: 'ffmpegInput',
                title: 'FFmpeg Input Stream Override',
                description: 'Optional override of FFmpeg input arguments passed to the media manager.',
                placeholder: '-f mpegts -i udp://127.0.0.1:54321',
                value: this.getFfmpegInput(),
            },
            {
                key: 'noAudio',
                title: 'No Audio',
                description: 'Enable this setting if the camera does not have audio or to mute audio.',
                type: 'boolean',
                value: (this.isAudioDisabled()).toString(),
            },
        ];
    }

    // implement
    async putSetting(key: string, value: SettingValue) {
        this.storage.setItem(key, value.toString());
    }

    getGStreamerInput(): string {
        return this.storage.getItem('gStreamerInput');
    }

    async putGStreamerInput(gStreamerInput: string) {
        this.storage.setItem('gStreamerInput', gStreamerInput);
    }

    getFfmpegInput(): string {
        return this.storage.getItem('ffmpegInput');
    }

    async putFfmpegInput(ffmpegInput: string) {
        this.storage.setItem('ffmpegInput', ffmpegInput);
    }

    isAudioDisabled() {
        return this.storage.getItem('noAudio') === 'true' || this.cameraStatus.UpdateSystemModelNumber === 'VMC3030';
    }
}