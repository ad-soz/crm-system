import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Results only include areas the user can view.
  @Get()
  search(@Query('q') q: string, @Request() req: any) {
    return this.searchService.search(q, req.user.permissions);
  }
}
