import { AdminApp } from '@/AdminApp'
import { CompareView } from '@/CompareView'
import { ParticipantApp } from '@/ParticipantApp'
import { URL_PARAMS } from '@/config'

export default function App() {
  if (URL_PARAMS.admin) return <AdminApp />
  if (URL_PARAMS.compare) return <CompareView />
  return <ParticipantApp />
}
