'use client'
import { startTransition, useActionState } from 'react'
import type { PriceSettings } from '@/lib/domain'
import type { ActionState } from '@/lib/payroll'
import { updatePricing } from '@/app/manager/settings/actions'
export function PricingSettingsForm({pricing}:{pricing:PriceSettings}) {
  const [state,action,pending]=useActionState(updatePricing,{} as ActionState)
  return <form action={action} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);startTransition(()=>action(form))}} className="form-card stack"><h2>Üldhinnad tellijale</h2>
    <fieldset disabled={pending} className="payroll-fields stack"><div className="form-grid two">
      <label>Tõstuk, €/h<input name="hourlyRate" required type="number" min="0" max="9999.99" step="0.01" defaultValue={pricing.hourlyRate}/></label>
      <label>Juhi eraldi tasu, €/h<input name="driverHourlyRate" required type="number" min="0" max="9999.99" step="0.01" defaultValue={pricing.driverHourlyRate??0}/></label>
      <label>Juht teeb töö, lisatasu €/h<input name="operatorWorkHourlyRate" required type="number" min="0" max="9999.99" step="0.01" defaultValue={pricing.operatorWorkHourlyRate??15}/></label>
      <label>Abiline, €/h inimese kohta<input name="helperHourlyRate" required type="number" min="0" max="9999.99" step="0.01" defaultValue={pricing.helperHourlyRate}/></label>
      <label>Miinimumtasu, €<input name="minimumOrder" required type="number" min="0" max="9999999.99" step="0.01" defaultValue={pricing.minimumOrder}/></label>
    </div><p className="muted">Kui juht sisaldub tõstuki hinnas, jäta juhi eraldi tasuks 0 €. „Juht teeb töö” lisatasu rakendub objektil tehtud tööle.</p>
    <details><summary>Transpordi hinnad</summary><div className="form-grid two top-gap"><label>Sõit, €/h<input name="driveHourlyRate" required type="number" min="0" max="9999.99" step="0.01" defaultValue={pricing.driveHourlyRate}/></label><label>Kilomeetrihind, €/km<input name="kmRate" required type="number" min="0" max="9999.99" step="0.01" defaultValue={pricing.kmRate}/></label></div></details>
    <button className="button primary" disabled={pending}>{pending?'Salvestan…':'Salvesta üldhinnad'}</button></fieldset>
    {state.error&&<p className="alert danger" role="alert">{state.error}</p>}{state.success&&<p className="alert success" role="status">{state.success}</p>}
  </form>
}
