import {PhotoUploader} from './PhotoUploader'
import {PhotoArchiveActions} from './PhotoArchiveActions'
export function JobPhotos({jobId,photos,manager=false}:{jobId:string;photos:{id:string;signed_url?:string|null;archived_at?:string|null;archive_error?:string|null}[];manager?:boolean}) {
 return <section id="photos" className="detail-card stack"><h2>Töö fotod</h2><PhotoUploader jobId={jobId}/>
 {manager&&photos.length>0&&<PhotoArchiveActions jobId={jobId}/>}
 <div className="form-grid two">{photos.map(p=><div key={p.id} className="stack">{p.signed_url?<a href={p.signed_url} target="_blank" rel="noreferrer"><img src={p.signed_url} alt="Töö foto – ava suurelt" loading="lazy" style={{width:'100%',maxHeight:240,objectFit:'cover',borderRadius:12}}/></a>:<p>Foto avamine ebaõnnestus. Värskenda lehte.</p>}{p.archived_at&&<small>Dropboxi arhiivis</small>}{manager&&<>{p.archive_error&&<small role="status">{p.archive_error}</small>}<PhotoArchiveActions photoId={p.id}/></>}</div>)}</div></section>
}
