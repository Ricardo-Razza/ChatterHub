package com.api.ChatterHub.service;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username:supergurizes@gmail.com}")
    private String fromEmail;

    public void sendVerificationCode(String toEmail, String username, String code) {
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            String htmlMsg = buildVerificationEmailTemplate(username, code);

            helper.setText(htmlMsg, true);
            helper.setTo(toEmail);
            helper.setSubject("Seu codigo de verificacao do ChatterHub: " + code);
            helper.setFrom(fromEmail);

            mailSender.send(mimeMessage);
            System.out.println("✅ [EmailService] E-mail com código real enviado com sucesso para: " + toEmail);
        } catch (Exception e) {
            System.err.println("⚠️ [EmailService] Não foi possível despachar via SMTP: " + e.getMessage());
            System.out.println("==================================================");
            System.out.println("📧 [FALLBACK LOCAL] CÓDIGO DO CHATTERHUB PARA " + toEmail + ": " + code);
            System.out.println("==================================================");
        }
    }

    private String buildVerificationEmailTemplate(String username, String code) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset='utf-8'>");
        sb.append("<style>");
        sb.append("body { margin: 0; padding: 0; background-color: #0d0e12; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #dbdee1; }");
        sb.append(".container { max-width: 560px; margin: 40px auto; background-color: #1e1f22; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }");
        sb.append(".header { background: linear-gradient(135deg, #5865f2 0%, #3ba55d 100%); padding: 32px 24px; text-align: center; }");
        sb.append(".title { color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; }");
        sb.append(".content { padding: 32px 28px; }");
        sb.append(".greeting { font-size: 16px; color: #ffffff; margin-top: 0; font-weight: 600; }");
        sb.append(".description { font-size: 14px; line-height: 1.6; color: #949ba4; margin-bottom: 24px; }");
        sb.append(".code-box { background-color: #111214; border: 2px dashed #5865f2; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }");
        sb.append(".code-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #5865f2; font-weight: 700; margin-bottom: 6px; }");
        sb.append(".code-value { font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #57f287; font-family: monospace; }");
        sb.append(".footer { background-color: #111214; padding: 20px; text-align: center; font-size: 12px; color: #5c5e66; }");
        sb.append("</style></head><body>");
        sb.append("<div class='container'>");
        sb.append("<div class='header'><h1 class='title'>ChatterHub</h1><p style='margin:4px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;'>Bate-papo, Voz & Comunidades</p></div>");
        sb.append("<div class='content'>");
        sb.append("<p class='greeting'>Ola, ").append(username).append("!</p>");
        sb.append("<p class='description'>Para confirmar seu cadastro no ChatterHub, utilize o codigo de verificacao abaixo:</p>");
        sb.append("<div class='code-box'><div class='code-label'>Codigo de Confirmacao</div><div class='code-value'>").append(code).append("</div></div>");
        sb.append("<p class='description' style='margin-bottom:0;'>Este codigo expira em 15 minutos.</p>");
        sb.append("</div>");
        sb.append("<div class='footer'>© 2026 ChatterHub Inc. Todos os direitos reservados.</div>");
        sb.append("</div></body></html>");
        return sb.toString();
    }
}