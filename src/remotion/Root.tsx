import { Composition, staticFile } from 'remotion';
import { VideoComposition } from './VideoComposition';
import { createDemo, totalFrames } from '../domain/project';
export const Root = () => (
  <Composition
    id="EditorVertical"
    component={VideoComposition}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={900}
    defaultProps={{ project: createDemo(), mediaUrl: null, assetBase: staticFile('assets') }}
    calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props.project) })}
  />
);
