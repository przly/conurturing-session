import { STUDY_TEXT as copy } from '../text'

export function HomeCircles({ point }: { point: number }) {
  const separation = 21 - (point - 1) * 3
  return (
    <svg aria-hidden="true" viewBox="0 0 94 82" className="w-full max-w-24">
      <circle cx={47 - separation} cy="28" r="23" fill="currentColor" fillOpacity=".08" stroke="currentColor" />
      <circle cx={47 + separation} cy="40" r="23" fill="currentColor" fillOpacity=".08" stroke="currentColor" />
      <path d={`M${47 - separation} 28 L15 12 M${47 + separation} 49 L76 72`} stroke="currentColor" strokeOpacity=".5" />
      <text x="3" y="12" fontSize="13" fill="currentColor">{copy.iosMe}</text>
      <text x="92" y="81" textAnchor="end" fontSize="13" fill="currentColor">{copy.iosHome}</text>
    </svg>
  )
}
