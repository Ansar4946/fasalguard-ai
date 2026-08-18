import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenMeteoWeatherProvider } from './providers/open-meteo-weather.provider';
import { OpenWeatherMapWeatherProvider } from './providers/openweathermap-weather.provider';
import { WEATHER_PROVIDER, type WeatherProvider } from './providers/weather.provider';
import { WeatherController } from './weather.controller';
import { WeatherRulesEngine } from './weather-rules.engine';
import { WeatherService } from './weather.service';
import { WeatherAlertService } from './weather-alert.service';
import { RiskModule } from '../risk/risk.module';
import { AuthModule } from '../auth/auth.module';
import { schedulerEnabled } from '../../infrastructure/execution-role';
@Module({
  imports: [RiskModule, AuthModule],
  controllers: [WeatherController],
  providers: [
    WeatherService,
    WeatherRulesEngine,
    OpenMeteoWeatherProvider,
    OpenWeatherMapWeatherProvider,
    ...(schedulerEnabled() ? [WeatherAlertService] : []),
    {
      provide: WEATHER_PROVIDER,
      inject: [ConfigService, OpenMeteoWeatherProvider, OpenWeatherMapWeatherProvider],
      useFactory: (
        config: ConfigService,
        openMeteo: OpenMeteoWeatherProvider,
        openWeatherMap: OpenWeatherMapWeatherProvider,
      ): WeatherProvider =>
        config.get<string>('weatherProvider') === 'openweathermap' ? openWeatherMap : openMeteo,
    },
  ],
})
export class WeatherModule {}
