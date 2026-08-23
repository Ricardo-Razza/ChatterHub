import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { UserService } from "./services/user.service";
import { ServerSidebarComponent } from "./layout/server-sidebar/server-sidebar.component";
import { ChannelSidebarComponent } from "./layout/channel-sidebar/channel-sidebar.component";
import { MainAreaComponent } from "./layout/main-area/main-area.component";
import { LoginComponent } from "./layout/login/login.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    ServerSidebarComponent,
    ChannelSidebarComponent,
    MainAreaComponent,
    LoginComponent,
  ],
  templateUrl: "./app.component.html",
})
export class AppComponent {
  constructor(readonly userService: UserService) {}
}