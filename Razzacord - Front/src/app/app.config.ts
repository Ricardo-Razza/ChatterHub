import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import {
  LucideAngularModule, MessageSquare, Mic, MicOff, Headphones,
  Settings, Plus, Hash, Volume2, VolumeX, ChevronDown, Send, Paperclip, Smile,
  Gift, PlusCircle, ScreenShare, PhoneOff, Video, VideoOff, Users,
  Search, Bell, Pin, Inbox, HelpCircle, AtSign, Compass, X, Shield, Sliders, Monitor,
  AlertCircle, AlertTriangle, CheckCircle, Info, Check, Pencil, Trash2, MessageCircle,
  LogOut, UserPlus
} from 'lucide-angular';
import { routes } from './app.routes';
import { AuthInterceptor } from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    importProvidersFrom(
      LucideAngularModule.pick({
        MessageSquare, Mic, MicOff, Headphones, Settings, Plus, Hash, Volume2,
        VolumeX, ChevronDown, Send, Paperclip, Smile, Gift, PlusCircle, ScreenShare,
        PhoneOff, Video, VideoOff, Users, Search, Bell, Pin, Inbox, HelpCircle,
        AtSign, Compass, X, Shield, Sliders, Monitor,
        AlertCircle, AlertTriangle, CheckCircle, Info, Check, Pencil, Trash2,
        MessageCircle, LogOut, UserPlus
      })
    ),
  ],
};