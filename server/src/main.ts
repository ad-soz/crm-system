import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [])
      : ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173'],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  // Production: serve the built frontend from the same process, so no Vite
  // dev server needs to run. Set CLIENT_DIST to the client's build folder.
  const clientDist = process.env.CLIENT_DIST ? resolve(process.env.CLIENT_DIST) : null;
  if (clientDist) {
    const indexHtml = join(clientDist, 'index.html');
    if (!existsSync(indexHtml)) {
      throw new Error(`CLIENT_DIST is set but ${indexHtml} does not exist. Build the client first.`);
    }
    // Hashed asset files never change, so they can be cached for a long time.
    app.useStaticAssets(join(clientDist, 'assets'), { prefix: '/assets', maxAge: '365d', immutable: true });
    app.useStaticAssets(clientDist, { index: false });
    // Any other page URL is handled by the React router.
    app.use((req: any, res: any, next: any) => {
      if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  // Bind to localhost in dev, all interfaces in production.
  // Set HOST to override (e.g., HOST=127.0.0.1 for local-only).
  const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  await app.listen(Number(process.env.PORT ?? 3001), host);
}
bootstrap();
