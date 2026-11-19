import {PhotoUploader} from './PhotoUploader'
export function JobPhotos({jobId,photos}:{jobId:string;photos:{id:string;signed_url?:string|null}[]}) {
return <section id="photos" className="detail-card stack"><h2>Töö fotod</h2><PhotoUploader jobId={jobId}/><div className="form-grid two">{photos.map(p=>p.signed_url?<a key={p.id} href={p.signed_url} target="_blank" rel="noreferrer"><img src={p.signed_url} alt="Töö foto – ava suurelt" loading="lazy" style={{width:'100%',maxHeight:240,objectFit:'cover',borderRadius:12}}/></a>:<p key={p.id}>Foto avamine ebaõnnestus. Värskenda lehte.</p>)}</div></section>
}
