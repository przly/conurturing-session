import { useEffect, useState } from 'react'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxStatus,
} from '@/components/ui/combobox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Screen } from '@/shared/components/Screen'
import { searchPlaces, type Place } from '../geocoding'
import { START_TEXT } from '../text'

export interface StartDetails {
  /** Null coordinates only if the lookup service was down and the name was typed by hand. */
  hometown: { name: string; lat: number | null; lon: number | null }
  familyName: string | null
}

const SEARCH_DELAY_MS = 250
const MIN_QUERY = 2

export function StartScreen({ onStart }: { onStart: (details: StartDetails) => Promise<void> }) {
  const [consent, setConsent] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [place, setPlace] = useState<Place | null>(null)
  const [searching, setSearching] = useState(false)
  /** The lookup service failed: from then on the hometown is a plain text field. */
  const [searchFailed, setSearchFailed] = useState(false)
  const [family, setFamily] = useState('')
  const [showMissing, setShowMissing] = useState(false)
  const [busy, setBusy] = useState(false)

  // Search as they type (debounced; the previous request is cancelled).
  useEffect(() => {
    const q = query.trim()
    if (searchFailed || q.length < MIN_QUERY || q === place?.label) return
    const controller = new AbortController()
    const id = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchPlaces(q, controller.signal))
      } catch (error) {
        if (controller.signal.aborted) return
        console.warn(error)
        setSearchFailed(true)
        setResults([])
      }
      setSearching(false)
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(id)
      controller.abort()
    }
  }, [query, place, searchFailed])

  // If the lookup service is down, a typed name is accepted (the weather then falls back to "cloudy").
  const typedFallback = searchFailed && !place && query.trim().length >= MIN_QUERY
  const hometownOk = Boolean(place) || typedFallback
  const complete = consent && hometownOk

  const start = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!complete) {
      setShowMissing(true)
      return
    }
    setBusy(true)
    try {
      await onStart({
        hometown: place
          ? { name: place.name, lat: place.lat, lon: place.lon }
          : { name: query.trim(), lat: null, lon: null },
        familyName: family.trim() || null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title={START_TEXT.title} description={START_TEXT.description}>
      <form onSubmit={start} className="flex flex-col gap-6" noValidate>
        <Field invalid={showMissing && !hometownOk}>
          <FieldLabel>{START_TEXT.hometownLabel}</FieldLabel>
          {searchFailed && !place ? (
            // The combobox clears free text on blur, so typing by hand needs a plain field.
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="For example: Ljubljana"
              autoComplete="off"
              autoFocus
              maxLength={80}
            />
          ) : (
          <Combobox<Place>
            items={results}
            filter={null}
            value={place}
            onValueChange={(value) => setPlace(value)}
            inputValue={query}
            onInputValueChange={(value) => {
              setQuery(value)
              if (place && value !== place.label) setPlace(null)
            }}
            itemToStringLabel={(p) => p.label}
            isItemEqualToValue={(a, b) => a.lat === b.lat && a.lon === b.lon}
          >
            <ComboboxInput placeholder="For example: Ljubljana" showTrigger={false} autoComplete="off" />
            <ComboboxPopup>
              <ComboboxStatus>
                {searching ? 'Searching…' : searchFailed ? 'Search isn’t working right now.' : null}
              </ComboboxStatus>
              <ComboboxEmpty>
                {!searching && !searchFailed && query.trim().length >= MIN_QUERY ? 'No places found.' : null}
              </ComboboxEmpty>
              <ComboboxList>
                {(item: Place) => (
                  <ComboboxItem key={`${item.lat},${item.lon}`} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>
          )}
          <FieldDescription>
            {searchFailed && !place
              ? 'The place search isn’t working right now. Type the name of your hometown and continue.'
              : START_TEXT.hometownHint}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>{START_TEXT.familyLabel}</FieldLabel>
          <Input
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            placeholder="For example: Mum"
            autoComplete="off"
            maxLength={60}
          />
          <FieldDescription>{START_TEXT.familyHint}</FieldDescription>
        </Field>

        <Alert variant="info">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{START_TEXT.noMic}</AlertDescription>
        </Alert>

        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={consent}
            onCheckedChange={(checked) => setConsent(checked === true)}
            aria-invalid={(showMissing && !consent) || undefined}
            className="mt-0.5"
          />
          {START_TEXT.consent}
        </label>

        {showMissing && !complete && (
          <Alert variant="error">
            <AlertDescription>
              {!hometownOk && !consent
                ? 'Please choose your hometown from the list and tick the box to agree.'
                : !hometownOk
                  ? 'Please choose your hometown from the list.'
                  : 'Please tick the box to agree.'}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" loading={busy} className="self-start">
          Start
        </Button>
      </form>
    </Screen>
  )
}
