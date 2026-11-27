import {PhotoUploader} from './PhotoUploader'
import {PhotoArchiveActions} from './PhotoArchiveActions'
import {PhotoGallery,type GalleryPhoto} from './PhotoGallery'
export function JobPhotos({jobId,photos,manager=false}:{jobId:string;photos:GalleryPhoto[];manager?:boolean}) {
 return <section id="photos" className="detail-card stack"><h2>Töö fotod</h2><PhotoUploader jobId={jobId}/>
 {manager&&photos.length>0&&<PhotoArchiveActions jobId={jobId}/>}
 <PhotoGallery photos={photos} manager={manager}/></section>
}

