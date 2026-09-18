import health from '@service.health'
// For the documented contest emulator. Never label emulator replay as wearer data.
export default {
  subscribe(receive, fail) {
    let alive = true
    const types = []
    ;[['HEART_RATE', 'heartRate'], ['SPO2', 'spo2'], ['STRESS', 'stress']].forEach(row => {
      try {
        const dataType = health.DATA_TYPES[row[0]]
        types.push(dataType)
        health.subscribeSample({ dataType,
          callback(sample) {
            if (!alive) return
            receive(row[1], { value: sample && sample.value, at: sample && sample.timeStamp, source: 'replay' })
          }, fail() { if (alive) fail(row[1]) } })
      } catch (e) { if (alive) fail(row[1]) }
    })
    return () => { alive = false; types.forEach(dataType => { try { health.unsubscribeSample({ dataType }) } catch (e) {} }) }
  }
}
