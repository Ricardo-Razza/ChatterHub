import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PERM, PERM_LABELS, ServerMember, ServerRole } from '../../models/role.model';
import { PermissionService } from '../../services/permission.service';
import { RoleService } from '../../services/role.service';
import { ServerService } from '../../services/server.service';
import { ToastService } from '../../services/toast.service';

type Tab = 'roles' | 'members';
const EVERYONE = '@todos';
const DEFAULT_PERMISSIONS = PERM.CREATE_INVITE | PERM.STREAM;

@Component({
  selector: 'app-server-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './server-settings-modal.component.html',
})
export class ServerSettingsModalComponent {
  readonly PERM_LABELS = PERM_LABELS;
  readonly EVERYONE = EVERYONE;

  readonly visible = signal(false);
  readonly tab = signal<Tab>('roles');
  readonly selectedId = signal<string>(EVERYONE);
  readonly saving = signal(false);

  // Rascunho do cargo selecionado
  readonly draftName = signal('');
  readonly draftColor = signal('#99AAB5');
  readonly draftPerms = signal(0);

  // A API não expõe o valor atual de @todos; começa no padrão do servidor.
  readonly defaultPerms = signal(DEFAULT_PERMISSIONS);

  readonly openMenuFor = signal<string | null>(null);
  readonly confirmKickFor = signal<string | null>(null);
  readonly confirmDelete = signal(false);

  readonly canManageRoles = computed(() => this.perm.can(PERM.MANAGE_ROLES));
  readonly canKick = computed(() => this.perm.can(PERM.KICK_MEMBERS));

  readonly sortedRoles = computed<ServerRole[]>(() =>
    [...this.roleService.roles()].sort((a, b) => b.position - a.position)
  );

  readonly selectedRole = computed<ServerRole | undefined>(() =>
    this.roleService.roles().find((r) => r.id === this.selectedId())
  );

  constructor(
    readonly perm: PermissionService,
    readonly roleService: RoleService,
    private readonly serverService: ServerService,
    private readonly toast: ToastService
  ) {}

  open(): void {
    this.tab.set(this.canManageRoles() ? 'roles' : 'members');
    this.selectedId.set(EVERYONE);
    this.openMenuFor.set(null);
    this.confirmKickFor.set(null);
    this.confirmDelete.set(false);
    this.visible.set(true);
    this.roleService.load();
  }

  close(): void {
    this.visible.set(false);
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    this.openMenuFor.set(null);
    this.confirmKickFor.set(null);
  }

  // ---------- Cargos ----------

  isReadOnly(role: ServerRole): boolean {
    return !this.canManageRoles() || (!this.perm.isOwner() && role.position >= this.perm.topPosition());
  }

  /** Editor de @todos: só o dono altera. */
  get everyoneReadOnly(): boolean {
    return !this.perm.isOwner();
  }

  get editorReadOnly(): boolean {
    if (this.selectedId() === EVERYONE) return this.everyoneReadOnly;
    const role = this.selectedRole();
    return !role || this.isReadOnly(role);
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.confirmDelete.set(false);
    if (id === EVERYONE) {
      this.draftPerms.set(this.defaultPerms());
      return;
    }
    const role = this.roleService.roles().find((r) => r.id === id);
    if (!role) return;
    this.draftName.set(role.name);
    this.draftColor.set(role.color);
    this.draftPerms.set(role.permissions);
  }

  /** Permissão bloqueada: cargo somente-leitura ou a pessoa não a possui. */
  permDisabled(bit: number): boolean {
    if (this.editorReadOnly) return true;
    if (this.selectedId() === EVERYONE) return false;
    return !this.perm.can(bit);
  }

  hasDraftPerm(bit: number): boolean {
    return (this.draftPerms() & bit) === bit;
  }

  toggleDraftPerm(bit: number): void {
    if (this.permDisabled(bit)) return;
    this.draftPerms.update((p) => (p & bit ? p & ~bit : p | bit));
  }

  async createRole(): Promise<void> {
    try {
      const created = await this.roleService.create({ name: 'Novo cargo', color: '#99AAB5', permissions: 0 });
      this.selectedId.set(created.id);
      this.draftName.set(created.name);
      this.draftColor.set(created.color);
      this.draftPerms.set(created.permissions);
    } catch { /* toast já exibido */ }
  }

  async saveRole(): Promise<void> {
    if (this.editorReadOnly) return;
    this.saving.set(true);
    try {
      if (this.selectedId() === EVERYONE) {
        await this.roleService.setDefaultPermissions(this.draftPerms());
        this.defaultPerms.set(this.draftPerms());
        this.toast.success('Permissões de @todos salvas');
      } else {
        await this.roleService.update(this.selectedId(), {
          name: this.draftName().trim(),
          color: this.draftColor(),
          permissions: this.draftPerms(),
        });
        this.toast.success('Cargo salvo');
      }
    } catch { /* toast já exibido */ }
    finally { this.saving.set(false); }
  }

  async deleteRole(): Promise<void> {
    const role = this.selectedRole();
    if (!role || this.isReadOnly(role)) return;
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    try {
      await this.roleService.remove(role.id);
      this.confirmDelete.set(false);
      this.select(EVERYONE);
    } catch { /* toast já exibido */ }
  }

  canMove(role: ServerRole, dir: -1 | 1): boolean {
    if (!this.canManageRoles()) return false;
    const list = this.sortedRoles();
    const i = list.findIndex((r) => r.id === role.id);
    const target = list[i + dir]; // -1 = para cima (mais alto)
    if (i < 0 || !target) return false;
    return !this.isReadOnly(role) && !this.isReadOnly(target);
  }

  async move(role: ServerRole, dir: -1 | 1): Promise<void> {
    if (!this.canMove(role, dir)) return;
    const ids = this.sortedRoles().map((r) => r.id);
    const i = ids.indexOf(role.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    try { await this.roleService.reorder(ids); } catch { /* toast já exibido */ }
  }

  // ---------- Membros ----------

  private topOf(member: ServerMember): number {
    const roles = this.roleService.roles().filter((r) => member.roleIds.includes(r.id));
    return roles.reduce((max, r) => Math.max(max, r.position), 0);
  }

  /** Quem não é dono só age sobre membro de posição menor; ninguém age sobre o dono. */
  canActOn(member: ServerMember): boolean {
    if (member.owner) return false;
    return this.perm.isOwner() || this.topOf(member) < this.perm.topPosition();
  }

  canKickMember(member: ServerMember): boolean {
    return this.canKick() && this.canActOn(member);
  }

  roleOf(id: string): ServerRole | undefined {
    return this.roleService.roles().find((r) => r.id === id);
  }

  memberRoles(member: ServerMember): ServerRole[] {
    return this.sortedRoles().filter((r) => member.roleIds.includes(r.id));
  }

  roleCheckDisabled(member: ServerMember, role: ServerRole): boolean {
    return !this.canManageRoles() || !this.canActOn(member) || this.isReadOnly(role);
  }

  toggleMenu(memberId: string): void {
    this.openMenuFor.update((cur) => (cur === memberId ? null : memberId));
  }

  async toggleMemberRole(member: ServerMember, role: ServerRole): Promise<void> {
    if (this.roleCheckDisabled(member, role)) return;
    const ids = member.roleIds.includes(role.id)
      ? member.roleIds.filter((id) => id !== role.id)
      : [...member.roleIds, role.id];
    try { await this.roleService.setMemberRoles(member.id, ids); } catch { /* toast já exibido */ }
  }

  async kick(member: ServerMember): Promise<void> {
    if (!this.canKickMember(member)) return;
    if (this.confirmKickFor() !== member.id) {
      this.confirmKickFor.set(member.id);
      return;
    }
    try {
      await this.roleService.kick(member.id);
      this.confirmKickFor.set(null);
    } catch { /* toast já exibido */ }
  }

  get serverName(): string {
    return this.serverService.activeServer()?.name ?? '';
  }
}
