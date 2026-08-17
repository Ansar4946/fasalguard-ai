import { Module } from '@nestjs/common';
import { OpenMeteoWeatherProvider } from './providers/open-meteo-weather.provider';
import { WEATHER_PROVIDER } from './providers/weather.provider';
import { WeatherController } from './weather.controller';
import { WeatherRulesEngine } from './weather-rules.engine';
import { WeatherService } from './weather.service';
import { RiskModule } from '../risk/risk.module';
@Module({
  imports: [RiskModule],
  controllers: [WeatherController],
  providers: [
    WeatherService,
    WeatherRulesEngine,
    OpenMeteoWeatherProvider,
    { provide: WEATHER_PROVIDER, useExisting: OpenMeteoWeatherProvider },
  ],
})
export class WeatherModule {}
