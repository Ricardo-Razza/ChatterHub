import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { LucideAngularModule, MessageSquare, Mic, MicOff, Headphones,
  Settings, Plus, Hash, Volume2, ChevronDown, Send, Paperclip, Smile,
  Gift, PlusCircle, ScreenShare, PhoneOff, Video, VideoOff, Users,
  Search, Bell, Pin, Inbox, HelpCircle, AtSign, Compass, X, Shield } from 'lucide-angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withFetch()),
    importProvidersFrom(
      LucideAngularModule.pick({
        MessageSquare, Mic, MicOff, Headphones, Settings, Plus, Hash, Volume2,
        ChevronDown, Send, Paperclip, Smile, Gift, PlusCircle, ScreenShare,
        PhoneOff, Video, VideoOff, Users, Search, Bell, Pin, Inbox, HelpCircle,
        AtSign, Compass, X, Shield
      })
    ),
  ],
};