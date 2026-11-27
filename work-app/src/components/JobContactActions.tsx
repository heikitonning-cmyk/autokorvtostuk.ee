export function JobContactActions({navigationUrl,phoneUrl}:{navigationUrl:string|null;phoneUrl:string|null}) {
  return <div className="action-grid two job-contact-actions">
    {navigationUrl ? <a className="button secondary" href={navigationUrl} target="_blank" rel="noreferrer">Navigeeri</a> : <span className="button disabled" aria-disabled="true">Aadress puudub</span>}
    {phoneUrl ? <a className="button secondary" href={phoneUrl}>Helista tellijale</a> : <span className="button disabled" aria-disabled="true">Telefon puudub</span>}
  </div>
}
