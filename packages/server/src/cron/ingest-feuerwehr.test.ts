import { describe, it, expect } from 'vitest';
import { parseMissionCsv } from './ingest-feuerwehr.js';

// Representative sample of the monthly CSV (header + 3 data rows)
const SAMPLE_CSV = `mission_created_month,mission_count_all,mission_count_ems,mission_count_ems_critical,mission_count_ems_critical_cpr,mission_count_fire,mission_count_technical_rescue,mission_count_rd1,mission_count_rd2,mission_count_rd3,mission_count_rd4,mission_count_rd5,response_time_ems_critical_mean,response_time_ems_critical_median,response_time_ems_critical_std,response_time_ems_critical_cpr_mean,response_time_ems_critical_cpr_median,response_time_ems_critical_cpr_std,response_time_fire_time_to_first_pump_mean,response_time_fire_time_to_first_pump_median,response_time_fire_time_to_first_pump_std,response_time_fire_time_to_first_ladder_mean,response_time_fire_time_to_first_ladder_median,response_time_fire_time_to_first_ladder_std,response_time_fire_time_to_full_crew_mean,response_time_fire_time_to_full_crew_median,response_time_fire_time_to_full_crew_std,response_time_technical_rescue_mean,response_time_technical_rescue_median,response_time_technical_rescue_std
2026-01,49663,44789,24658,423,2124,1632,13200,6500,4000,800,158,620.68,591.0,250.3,480.5,470.0,180.2,583.23,548.0,220.1,650.0,620.0,240.5,700.0,680.0,260.0,550.0,530.0,200.0
2026-02,41751,37743,21267,374,1374,1631,11000,5500,3500,700,567,613.1,585.0,245.0,490.2,475.0,185.0,590.38,556.0,225.0,645.0,615.0,235.0,695.0,675.0,255.0,545.0,525.0,195.0
2026-03,4605,4173,2337,35,166,151,1200,600,400,80,57,602.77,576.0,240.0,500.0,480.0,190.0,582.15,540.0,218.0,640.0,610.0,230.0,690.0,670.0,250.0,540.0,520.0,190.0`;

describe('parseMissionCsv', () => {
  it('returns current, partial, and previous months', () => {
    // Pretend today is 2026-03-04 → current complete = 2026-02, partial = 2026-03, previous = 2026-01
    const result = parseMissionCsv(SAMPLE_CSV, '2026-03');
    expect(result).not.toBeNull();
    expect(result!.current.reportMonth).toBe('2026-02');
    expect(result!.partial).not.toBeNull();
    expect(result!.partial!.reportMonth).toBe('2026-03');
    expect(result!.previous).not.toBeNull();
    expect(result!.previous!.reportMonth).toBe('2026-01');
  });

  it('extracts mission counts correctly', () => {
    const result = parseMissionCsv(SAMPLE_CSV, '2026-03');
    expect(result!.current.missionCountAll).toBe(41751);
    expect(result!.current.missionCountEms).toBe(37743);
    expect(result!.current.missionCountFire).toBe(1374);
    expect(result!.current.missionCountTechnicalRescue).toBe(1631);
  });

  it('extracts response times correctly', () => {
    const result = parseMissionCsv(SAMPLE_CSV, '2026-03');
    expect(result!.current.responseTimeEmsCriticalMedian).toBe(585.0);
    expect(result!.current.responseTimeFirePumpMedian).toBe(556.0);
  });

  it('returns null for empty CSV', () => {
    const result = parseMissionCsv('', '2026-03');
    expect(result).toBeNull();
  });

  it('returns null partial when current month is not in data', () => {
    const result = parseMissionCsv(SAMPLE_CSV, '2026-04');
    // 2026-03 is now the last complete month, 2026-04 partial is missing
    expect(result).not.toBeNull();
    expect(result!.current.reportMonth).toBe('2026-03');
    expect(result!.partial).toBeNull();
    expect(result!.previous!.reportMonth).toBe('2026-02');
  });
});
